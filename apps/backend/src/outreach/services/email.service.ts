import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import sgMail = require('@sendgrid/mail');

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
  textBody?: string;
}

export interface EmailOptions {
  fromEmail?: string;
  fromName?: string;
  replyTo?: string;
  customHeaders?: Record<string, string>;
  templateId?: string;
  templateData?: Record<string, any>;
  categories?: string[];
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  retryAfter?: number;
}

export interface BatchResult {
  successful: number;
  failed: number;
  results: EmailResult[];
}

interface SendGridError {
  code?: number;
  message?: string;
  response?: {
    headers?: Record<string, string>;
    body?: {
      errors?: Array<{ message?: string; field?: string }>;
    };
  };
}

const TRANSIENT_ERROR_CODES = [429, 500, 502, 503, 504];
const BOUNCE_ERROR_CODES = [550, 551, 552, 553, 554];

/**
 * Email service for sending emails via SendGrid
 * Reads configuration directly from process.env for reliability
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly senderEmail: string;
  private readonly senderName: string;
  private readonly companyName: string;
  private readonly companyAddress: string;
  private readonly sendGridClient: typeof sgMail;
  private readonly isConfigured: boolean;

  constructor(
    @Optional() @Inject('SENDGRID_CLIENT') injectedClient?: any,
  ) {
    // Read directly from process.env for reliability
    this.senderEmail = process.env.EMAIL_FROM || 'noreply@example.com';
    this.senderName = process.env.EMAIL_FROM_NAME || 'Dormant Lead Reactivator';
    this.companyName = process.env.COMPANY_NAME || 'Your Company';
    this.companyAddress = process.env.COMPANY_ADDRESS || '123 Main St, City, State 12345';

    // Use injected client for testing, or real SendGrid client
    if (injectedClient) {
      this.sendGridClient = injectedClient;
      this.isConfigured = true;
      this.logger.log('SendGrid initialized with injected client (test mode)');
    } else {
      const apiKey = process.env.SENDGRID_API_KEY;
      if (apiKey) {
        sgMail.setApiKey(apiKey);
        this.isConfigured = true;
        this.logger.log('SendGrid initialized successfully');
      } else {
        this.isConfigured = false;
        this.logger.warn('SendGrid API key not configured - email sending disabled');
      }
      this.sendGridClient = sgMail;
    }
  }

  /**
   * Send a single email
   */
  async send(message: EmailMessage, options: EmailOptions = {}): Promise<EmailResult> {
    // Validate message
    const validationError = this.validateMessage(message, options);
    if (validationError) {
      return { success: false, error: validationError };
    }

    if (!this.isConfigured) {
      return { success: false, error: 'SendGrid not configured' };
    }

    try {
      const mailData = this.buildMailData(message, options);
      const [response] = await this.sendGridClient.send(mailData);

      const messageId = response.headers['x-message-id'];
      this.logger.log(`Email sent to ${message.to}, messageId: ${messageId}`);

      return { success: true, messageId };
    } catch (error) {
      return this.handleSendError(error as SendGridError);
    }
  }

  /**
   * Send email with retry logic for transient failures
   */
  async sendWithRetry(
    message: EmailMessage,
    options: {
      maxRetries?: number;
      baseDelayMs?: number;
      emailOptions?: EmailOptions;
    } = {},
  ): Promise<EmailResult> {
    const maxRetries = options.maxRetries || 3;
    const baseDelayMs = options.baseDelayMs || 1000;

    // Validate first (don't retry validation failures)
    const validationError = this.validateMessage(message, options.emailOptions || {});
    if (validationError) {
      return { success: false, error: validationError };
    }

    if (!this.isConfigured) {
      return { success: false, error: 'SendGrid not configured' };
    }

    let lastResult: EmailResult = { success: false, error: 'No attempts made' };

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const mailData = this.buildMailData(message, options.emailOptions || {});
        const [response] = await this.sendGridClient.send(mailData);

        const messageId = response.headers['x-message-id'];
        this.logger.log(`Email sent to ${message.to} (attempt ${attempt}), messageId: ${messageId}`);

        return { success: true, messageId };
      } catch (error) {
        const sendGridError = error as SendGridError;
        lastResult = this.handleSendError(sendGridError);

        // Don't retry permanent failures
        if (!this.isTransientError(sendGridError)) {
          break;
        }

        // Don't wait after last attempt
        if (attempt < maxRetries) {
          const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
          this.logger.debug(`Retrying in ${delayMs}ms (attempt ${attempt}/${maxRetries})`);
          await this.delay(delayMs);
        }
      }
    }

    return lastResult;
  }

  /**
   * Send multiple emails in batch with concurrency control
   */
  async sendBatch(
    messages: EmailMessage[],
    options: { concurrency?: number; emailOptions?: EmailOptions } = {},
  ): Promise<BatchResult> {
    const concurrency = options.concurrency || 5;
    const results: EmailResult[] = [];
    let successful = 0;
    let failed = 0;

    // Process in batches
    for (let i = 0; i < messages.length; i += concurrency) {
      const batch = messages.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map((msg) => this.send(msg, options.emailOptions)),
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

    this.logger.log(`Batch complete: ${successful} sent, ${failed} failed`);
    return { successful, failed, results };
  }

  /**
   * Validate email format
   */
  isValidEmail(email: string): boolean {
    if (!email || email.trim() === '') {
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Check if error is a bounce error
   */
  isBounceError(error: { code?: number }): boolean {
    return error.code !== undefined && BOUNCE_ERROR_CODES.includes(error.code);
  }

  /**
   * Check if error indicates invalid email
   */
  isInvalidEmailError(error: SendGridError): boolean {
    const errors = error.response?.body?.errors || [];
    return errors.some(
      (e) => e.field?.includes('email') || e.message?.toLowerCase().includes('invalid'),
    );
  }

  // Legacy method names for backwards compatibility
  async sendEmail(message: EmailMessage, options: EmailOptions = {}): Promise<EmailResult> {
    return this.send(message, options);
  }

  async sendEmailWithRetry(
    message: EmailMessage,
    options?: { maxRetries?: number; baseDelayMs?: number; emailOptions?: EmailOptions },
  ): Promise<EmailResult> {
    return this.sendWithRetry(message, options);
  }

  /**
   * Build SendGrid mail data object with CAN-SPAM footer
   */
  private buildMailData(message: EmailMessage, options: EmailOptions): sgMail.MailDataRequired {
    // Add CAN-SPAM compliant footer
    const footer = this.buildFooter();
    const htmlWithFooter = message.body + footer.html;
    const textWithFooter = (message.textBody || this.stripHtml(message.body)) + footer.text;

    const mailData = {
      to: message.to,
      from: {
        email: options.fromEmail || this.senderEmail,
        name: options.fromName || this.senderName,
      },
      subject: message.subject,
      html: htmlWithFooter,
      text: textWithFooter,
      trackingSettings: {
        clickTracking: { enable: true },
        openTracking: { enable: true },
      },
      templateId: undefined as string | undefined,
      dynamicTemplateData: undefined as Record<string, unknown> | undefined,
      replyTo: undefined as string | undefined,
      headers: undefined as Record<string, string> | undefined,
      categories: undefined as string[] | undefined,
    };

    // Use template if provided (template has its own footer)
    if (options.templateId) {
      mailData.templateId = options.templateId;
      mailData.html = message.body || ' ';
      if (options.templateData) {
        mailData.dynamicTemplateData = options.templateData;
      }
    }

    if (options.replyTo) {
      mailData.replyTo = options.replyTo;
    }

    if (options.customHeaders) {
      mailData.headers = options.customHeaders;
    }

    if (options.categories) {
      mailData.categories = options.categories;
    }

    return mailData as unknown as sgMail.MailDataRequired;
  }

  /**
   * Build CAN-SPAM compliant footer
   */
  private buildFooter(): { html: string; text: string } {
    const html = `
      <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
        <p>${this.companyName}<br>${this.companyAddress}</p>
        <p><a href="{{unsubscribe_url}}" style="color: #666;">Unsubscribe</a></p>
      </div>
    `;
    const text = `\n\n---\n${this.companyName}\n${this.companyAddress}\nUnsubscribe: {{unsubscribe_url}}`;
    return { html, text };
  }

  /**
   * Strip HTML tags for plain text version
   */
  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Validate message before sending
   */
  private validateMessage(message: EmailMessage, options: EmailOptions): string | null {
    if (!this.isValidEmail(message.to)) {
      return 'Invalid email address';
    }

    // Skip subject/body validation if using template
    if (options.templateId) {
      return null;
    }

    if (!message.subject || message.subject.trim() === '') {
      return 'Subject is required';
    }

    if (!message.body || message.body.trim() === '') {
      return 'Body is required';
    }

    return null;
  }

  /**
   * Handle send error and return result
   */
  private handleSendError(error: SendGridError): EmailResult {
    const result: EmailResult = { success: false };

    if (error.response?.body?.errors?.[0]?.message) {
      result.error = error.response.body.errors[0].message;
    } else if (error.message) {
      result.error = error.message;
    } else {
      result.error = 'Unknown error';
    }

    // Check for rate limit
    if (error.code === 429) {
      const retryAfter = error.response?.headers?.['retry-after'];
      if (retryAfter) {
        result.retryAfter = parseInt(retryAfter, 10);
      }
    }

    this.logger.error(`Email send failed: ${result.error}`);
    return result;
  }

  /**
   * Check if error is transient (should retry)
   */
  private isTransientError(error: SendGridError): boolean {
    return error.code !== undefined && TRANSIENT_ERROR_CODES.includes(error.code);
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
