import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Twilio types
interface TwilioClient {
  messages: {
    create: (params: {
      to: string;
      from: string;
      body: string;
      statusCallback?: string;
    }) => Promise<TwilioMessage>;
  };
}

interface TwilioMessage {
  sid: string;
  status: string;
  numSegments: string;
}

export interface SmsMessage {
  to: string;
  body: string;
}

export interface SmsOptions {
  fromNumber?: string;
  requireConsent?: boolean;
  hasConsent?: boolean;
  isOptedOut?: boolean;
  statusCallback?: string;
}

export interface SmsResult {
  success: boolean;
  messageSid?: string;
  status?: string;
  segments?: number;
  error?: string;
  errorCode?: number;
}

export interface SmsBatchResult {
  successful: number;
  failed: number;
  results: SmsResult[];
}

interface TwilioError {
  code?: number;
  message?: string;
  status?: number;
  moreInfo?: string;
}

const OPT_OUT_KEYWORDS = ['STOP', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'];
const TRANSIENT_ERROR_CODES = [20429, 20500, 20503]; // Rate limit, server errors
const MAX_SMS_LENGTH = 1600;
const SEGMENT_SIZE = 160;
const CONCAT_SEGMENT_SIZE = 153;

/**
 * SMS service for sending text messages via Twilio
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly fromNumber: string;
  private readonly twilioClient: TwilioClient;

  constructor(
    private readonly configService: ConfigService,
    @Optional() @Inject('TWILIO_CLIENT') injectedClient?: TwilioClient,
  ) {
    this.fromNumber = this.configService.get<string>('twilio.phoneNumber') || '';

    // Use injected client for testing, or placeholder for production
    // Real Twilio client is injected via module providers
    if (injectedClient) {
      this.twilioClient = injectedClient;
    } else {
      // Placeholder client - real client should be injected in production
      this.twilioClient = {
        messages: {
          create: async () => {
            throw new Error('Twilio client not configured');
          },
        },
      };
    }
  }

  /**
   * Send a single SMS
   */
  async sendSms(message: SmsMessage, options: SmsOptions = {}): Promise<SmsResult> {
    // Validate phone number
    if (!this.isValidPhoneNumber(message.to)) {
      return { success: false, error: 'Invalid phone number format' };
    }

    // Check message length
    if (message.body.length > MAX_SMS_LENGTH) {
      return {
        success: false,
        error: `Message exceeds maximum length of ${MAX_SMS_LENGTH} characters`,
      };
    }

    // Check opt-out status
    if (options.isOptedOut) {
      return { success: false, error: 'Recipient has opted out of SMS' };
    }

    // Check consent
    if (options.requireConsent && !options.hasConsent) {
      return { success: false, error: 'SMS consent not provided' };
    }

    try {
      const twilioMessage = await this.twilioClient.messages.create({
        to: message.to,
        from: options.fromNumber || this.fromNumber,
        body: message.body,
        statusCallback: options.statusCallback,
      });

      const segments = parseInt(twilioMessage.numSegments, 10) || 1;

      this.logger.log(
        `SMS sent to ${message.to}, SID: ${twilioMessage.sid}, segments: ${segments}`,
      );

      return {
        success: true,
        messageSid: twilioMessage.sid,
        status: twilioMessage.status,
        segments,
      };
    } catch (error) {
      return this.handleSendError(error as TwilioError);
    }
  }

  /**
   * Send SMS with retry logic
   */
  async sendSmsWithRetry(
    message: SmsMessage,
    options: {
      maxRetries?: number;
      baseDelayMs?: number;
      smsOptions?: SmsOptions;
    } = {},
  ): Promise<SmsResult> {
    const maxRetries = options.maxRetries || 3;
    const baseDelayMs = options.baseDelayMs || 1000;

    let lastResult: SmsResult = { success: false, error: 'No attempts made' };

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const twilioMessage = await this.twilioClient.messages.create({
          to: message.to,
          from: options.smsOptions?.fromNumber || this.fromNumber,
          body: message.body,
        });

        return {
          success: true,
          messageSid: twilioMessage.sid,
          status: twilioMessage.status,
          segments: parseInt(twilioMessage.numSegments, 10) || 1,
        };
      } catch (error) {
        const twilioError = error as TwilioError;
        lastResult = this.handleSendError(twilioError);

        // Don't retry permanent failures
        if (!this.isTransientError(twilioError)) {
          break;
        }

        if (attempt < maxRetries) {
          const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
          await this.delay(delayMs);
        }
      }
    }

    return lastResult;
  }

  /**
   * Send multiple SMS messages in batch
   */
  async sendBatch(
    messages: SmsMessage[],
    options: { concurrency?: number; smsOptions?: SmsOptions } = {},
  ): Promise<SmsBatchResult> {
    const concurrency = options.concurrency || 5;
    const results: SmsResult[] = [];
    let successful = 0;
    let failed = 0;

    for (let i = 0; i < messages.length; i += concurrency) {
      const batch = messages.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map((msg) => this.sendSms(msg, options.smsOptions)),
      );

      for (const result of batchResults) {
        results.push(result);
        if (result.success) {
          successful++;
        } else {
          failed++;
        }
      }
    }

    return { successful, failed, results };
  }

  /**
   * Validate phone number in E.164 format
   */
  isValidPhoneNumber(phone: string): boolean {
    if (!phone || phone.trim() === '') {
      return false;
    }
    // E.164 format: + followed by 7-15 digits
    const e164Regex = /^\+[1-9]\d{6,14}$/;
    return e164Regex.test(phone);
  }

  /**
   * Calculate number of SMS segments for a message
   */
  calculateSegments(message: string): number {
    const length = message.length;
    if (length <= SEGMENT_SIZE) {
      return 1;
    }
    return Math.ceil(length / CONCAT_SEGMENT_SIZE);
  }

  /**
   * Check if a message is an opt-out request
   */
  isOptOutMessage(message: string): boolean {
    const normalized = message.trim().toUpperCase();
    return OPT_OUT_KEYWORDS.includes(normalized);
  }

  /**
   * Check if status indicates delivery failure
   */
  isDeliveryFailure(status: string): boolean {
    return ['failed', 'undelivered'].includes(status.toLowerCase());
  }

  /**
   * Handle send error and return result
   */
  private handleSendError(error: TwilioError): SmsResult {
    const result: SmsResult = { success: false };

    if (error.message) {
      result.error = error.message;
    } else {
      result.error = 'Unknown error';
    }

    if (error.code) {
      result.errorCode = error.code;
    }

    this.logger.error(`SMS send failed: ${result.error} (code: ${result.errorCode})`);

    return result;
  }

  /**
   * Check if error is transient (should retry)
   */
  private isTransientError(error: TwilioError): boolean {
    return error.code !== undefined && TRANSIENT_ERROR_CODES.includes(error.code);
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
