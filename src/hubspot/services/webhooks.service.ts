import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import * as crypto from 'crypto';

export enum WebhookEventType {
  CONTACT_PROPERTY_CHANGE = 'contact.propertyChange',
  CONTACT_CREATION = 'contact.creation',
  CONTACT_DELETION = 'contact.deletion',
  DEAL_PROPERTY_CHANGE = 'deal.propertyChange',
  DEAL_CREATION = 'deal.creation',
  DEAL_DELETION = 'deal.deletion',
  CONTACT_ASSOCIATION_CHANGE = 'contact.associationChange',
}

export interface WebhookEvent {
  eventId: string;
  eventType: WebhookEventType;
  portalId: number;
  objectId: number;
  occurredAt: Date;
  subscriptionType: string;
  propertyName?: string;
  propertyValue?: string;
  changeSource?: string;
  attemptNumber?: number;
}

export interface WebhookValidationResult {
  valid: boolean;
  reason?: string;
}

export interface SignatureValidationInput {
  signature: string;
  timestamp: string;
  method: string;
  url: string;
  body: string;
}

export interface QueueResult {
  queued: number;
  failed: number;
  errors: string[];
}

export interface ProcessedWebhookEvent extends WebhookEvent {
  processedAt: Date;
  result?: string;
}

interface RawWebhookPayload {
  eventId: number;
  subscriptionId: number;
  portalId: number;
  occurredAt: number;
  subscriptionType: string;
  attemptNumber: number;
  objectId: number;
  propertyName?: string;
  propertyValue?: string;
  changeSource?: string;
}

/**
 * Service for handling HubSpot webhook events
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private readonly clientSecret: string;
  private readonly appUrl: string;
  private readonly maxStaleMs = 5 * 60 * 1000; // 5 minutes

  constructor(
    private readonly configService: ConfigService,
    @InjectQueue('webhook-processing')
    private readonly webhookQueue: Queue,
  ) {
    this.clientSecret = this.configService.getOrThrow<string>(
      'HUBSPOT_CLIENT_SECRET',
    );
    this.appUrl = this.configService.getOrThrow<string>('APP_URL');
  }

  /**
   * Validate webhook request signature using HMAC-SHA256
   */
  validateSignature(input: SignatureValidationInput): WebhookValidationResult {
    const { signature, timestamp, method, url, body } = input;

    // Check for missing required fields
    if (!signature || !timestamp) {
      return {
        valid: false,
        reason: 'Missing signature or timestamp header',
      };
    }

    // Check if request is stale (older than 5 minutes)
    const requestTime = parseInt(timestamp, 10);
    const currentTime = Date.now();

    if (currentTime - requestTime > this.maxStaleMs) {
      return {
        valid: false,
        reason: 'Request is stale (older than 5 minutes)',
      };
    }

    // Compute expected signature
    const sourceString = `${method}${url}${body}${timestamp}`;
    const expectedSignature = crypto
      .createHmac('sha256', this.clientSecret)
      .update(sourceString)
      .digest('base64');

    // Compare signatures using timing-safe comparison
    try {
      const sigBuffer = Buffer.from(signature, 'base64');
      const expectedBuffer = Buffer.from(expectedSignature, 'base64');

      if (sigBuffer.length !== expectedBuffer.length) {
        return { valid: false, reason: 'Invalid signature' };
      }

      const isValid = crypto.timingSafeEqual(sigBuffer, expectedBuffer);

      if (!isValid) {
        return { valid: false, reason: 'Invalid signature' };
      }

      return { valid: true };
    } catch {
      return { valid: false, reason: 'Invalid signature format' };
    }
  }

  /**
   * Parse raw webhook payload into typed events
   */
  parseWebhookPayload(rawPayload: string): WebhookEvent[] {
    const payload: RawWebhookPayload[] = JSON.parse(rawPayload);

    return payload.map((item) => ({
      eventId: item.eventId.toString(),
      eventType: this.mapSubscriptionType(item.subscriptionType),
      portalId: item.portalId,
      objectId: item.objectId,
      occurredAt: new Date(item.occurredAt),
      subscriptionType: item.subscriptionType,
      propertyName: item.propertyName,
      propertyValue: item.propertyValue,
      changeSource: item.changeSource,
      attemptNumber: item.attemptNumber,
    }));
  }

  /**
   * Map HubSpot subscription type to enum
   */
  private mapSubscriptionType(subscriptionType: string): WebhookEventType {
    const mapping: Record<string, WebhookEventType> = {
      'contact.propertyChange': WebhookEventType.CONTACT_PROPERTY_CHANGE,
      'contact.creation': WebhookEventType.CONTACT_CREATION,
      'contact.deletion': WebhookEventType.CONTACT_DELETION,
      'deal.propertyChange': WebhookEventType.DEAL_PROPERTY_CHANGE,
      'deal.creation': WebhookEventType.DEAL_CREATION,
      'deal.deletion': WebhookEventType.DEAL_DELETION,
      'contact.associationChange': WebhookEventType.CONTACT_ASSOCIATION_CHANGE,
    };

    return mapping[subscriptionType] || WebhookEventType.CONTACT_PROPERTY_CHANGE;
  }

  /**
   * Queue events for async processing
   */
  async queueEvents(events: WebhookEvent[]): Promise<QueueResult> {
    const result: QueueResult = {
      queued: 0,
      failed: 0,
      errors: [],
    };

    for (const event of events) {
      try {
        await this.webhookQueue.add('process-webhook', event, {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
          removeOnComplete: true,
          removeOnFail: false,
        });

        result.queued++;
        this.logger.debug(
          `Queued webhook event ${event.eventId} (${event.eventType})`,
        );
      } catch (error) {
        result.failed++;
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`Event ${event.eventId}: ${errorMessage}`);
        this.logger.error(`Failed to queue event ${event.eventId}: ${errorMessage}`);
      }
    }

    this.logger.log(
      `Queued ${result.queued} webhook events, ${result.failed} failed`,
    );

    return result;
  }

  /**
   * Check if event is an email reply
   */
  isEmailReplyEvent(event: WebhookEvent): boolean {
    return (
      event.eventType === WebhookEventType.CONTACT_PROPERTY_CHANGE &&
      event.propertyName === 'hs_sales_email_last_replied'
    );
  }

  /**
   * Check if event is an email open
   */
  isEmailOpenEvent(event: WebhookEvent): boolean {
    return (
      event.eventType === WebhookEventType.CONTACT_PROPERTY_CHANGE &&
      event.propertyName === 'hs_email_last_open_date'
    );
  }

  /**
   * Check if event is an email click
   */
  isEmailClickEvent(event: WebhookEvent): boolean {
    return (
      event.eventType === WebhookEventType.CONTACT_PROPERTY_CHANGE &&
      event.propertyName === 'hs_email_last_click_date'
    );
  }

  /**
   * Check if event is a deal stage change
   */
  isDealStageChangeEvent(event: WebhookEvent): boolean {
    return (
      event.eventType === WebhookEventType.DEAL_PROPERTY_CHANGE &&
      event.propertyName === 'dealstage'
    );
  }

  /**
   * Get the webhook endpoint URL
   */
  getWebhookEndpointUrl(): string {
    return `${this.appUrl}/api/hubspot/webhooks`;
  }

  /**
   * Get list of supported webhook subscriptions
   */
  getSupportedSubscriptions(): string[] {
    return [
      'contact.propertyChange',
      'contact.creation',
      'contact.deletion',
      'deal.propertyChange',
      'deal.creation',
      'deal.deletion',
      'contact.associationChange',
    ];
  }

  /**
   * Remove duplicate events by eventId
   */
  deduplicateEvents(events: WebhookEvent[]): WebhookEvent[] {
    const seen = new Set<string>();
    return events.filter((event) => {
      if (seen.has(event.eventId)) {
        return false;
      }
      seen.add(event.eventId);
      return true;
    });
  }
}
