import { Processor, Process, OnQueueCompleted, OnQueueFailed } from '@nestjs/bull';
import { Logger, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bull';
import { QUEUE_NAMES } from '../config/redis.config';
import { BaseProcessor, JobResult, JobStatus } from './base.processor';
import { OutreachRecord, OutreachStatus } from '../entities/outreach-record.entity';

/**
 * HubSpot webhook event types
 */
export type WebhookEventType =
  | 'contact.propertyChange'
  | 'contact.creation'
  | 'contact.deletion'
  | 'deal.propertyChange'
  | 'deal.creation'
  | 'email.open'
  | 'email.click'
  | 'email.reply'
  | 'email.bounce';

/**
 * Job data for processing webhooks
 */
export interface WebhookJobData {
  eventType: WebhookEventType;
  portalId: number;
  objectId: number;
  propertyName?: string;
  propertyValue?: string;
  occurredAt: number;
  rawPayload: Record<string, unknown>;
}

export interface WebhookProcessingResult {
  processed: boolean;
  eventType: WebhookEventType;
  outreachFound?: boolean;
  requiresClassification?: boolean;
  error?: string;
}

/**
 * Processor for HubSpot webhook events
 * Handles contact property changes, deal updates, email opens/clicks/replies
 */
@Processor(QUEUE_NAMES.WEBHOOK_PROCESS)
export class WebhookProcessor extends BaseProcessor<WebhookJobData> {
  readonly queueName = QUEUE_NAMES.WEBHOOK_PROCESS;
  protected readonly logger = new Logger(WebhookProcessor.name);

  constructor(
    @InjectRepository(OutreachRecord)
    private readonly outreachRepository: Repository<OutreachRecord>,
  ) {
    super();
  }

  @Process()
  async processJob(job: Job<WebhookJobData>): Promise<JobResult> {
    const { eventType, portalId, objectId, propertyName, propertyValue } = job.data;
    this.logger.log(`Processing webhook: ${eventType} for portal ${portalId}, object ${objectId}`);

    try {
      let result: WebhookProcessingResult;

      switch (eventType) {
        case 'email.open':
          result = await this.handleEmailOpen(job.data);
          break;

        case 'email.click':
          result = await this.handleEmailClick(job.data);
          break;

        case 'email.reply':
          result = await this.handleEmailReply(job.data);
          break;

        case 'email.bounce':
          result = await this.handleEmailBounce(job.data);
          break;

        case 'contact.propertyChange':
          result = await this.handleContactPropertyChange(job.data);
          break;

        case 'deal.propertyChange':
          result = await this.handleDealPropertyChange(job.data);
          break;

        case 'contact.creation':
        case 'deal.creation':
          result = {
            processed: true,
            eventType,
          };
          break;

        default:
          this.logger.warn(`Unknown event type: ${eventType}`);
          result = {
            processed: true,
            eventType,
          };
      }

      await job.progress(100);

      return {
        status: JobStatus.COMPLETED,
        message: `Webhook processed: ${eventType}`,
        data: {
          eventType,
          portalId,
          objectId,
          propertyName,
          processedAt: new Date().toISOString(),
          outreachFound: result.outreachFound,
          requiresClassification: result.requiresClassification,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to process webhook ${eventType}: ${errorMessage}`);
      return {
        status: JobStatus.FAILED,
        message: `Failed to process webhook: ${eventType}`,
        error: errorMessage,
      };
    }
  }

  /**
   * Handle email open event
   */
  private async handleEmailOpen(data: WebhookJobData): Promise<WebhookProcessingResult> {
    const outreach = await this.findOutreachByContact(data.objectId);

    if (!outreach) {
      this.logger.debug(`No outreach found for contact ${data.objectId}`);
      return {
        processed: true,
        eventType: data.eventType,
        outreachFound: false,
      };
    }

    // Update outreach status
    outreach.status = OutreachStatus.OPENED;
    outreach.openedAt = new Date(data.occurredAt);
    await this.outreachRepository.save(outreach);

    this.logger.log(`Updated outreach ${outreach.id} to OPENED`);

    return {
      processed: true,
      eventType: data.eventType,
      outreachFound: true,
    };
  }

  /**
   * Handle email click event
   */
  private async handleEmailClick(data: WebhookJobData): Promise<WebhookProcessingResult> {
    const outreach = await this.findOutreachByContact(data.objectId);

    if (!outreach) {
      return {
        processed: true,
        eventType: data.eventType,
        outreachFound: false,
      };
    }

    // Update outreach status
    outreach.status = OutreachStatus.CLICKED;
    outreach.clickedAt = new Date(data.occurredAt);
    await this.outreachRepository.save(outreach);

    this.logger.log(`Updated outreach ${outreach.id} to CLICKED`);

    return {
      processed: true,
      eventType: data.eventType,
      outreachFound: true,
    };
  }

  /**
   * Handle email reply event - triggers classification
   */
  private async handleEmailReply(data: WebhookJobData): Promise<WebhookProcessingResult> {
    const outreach = await this.findOutreachByContact(data.objectId);

    if (!outreach) {
      return {
        processed: true,
        eventType: data.eventType,
        outreachFound: false,
      };
    }

    // Update outreach status
    outreach.status = OutreachStatus.REPLIED;
    outreach.repliedAt = new Date(data.occurredAt);
    await this.outreachRepository.save(outreach);

    this.logger.log(`Updated outreach ${outreach.id} to REPLIED - requires classification`);

    // This event requires classification of the reply
    return {
      processed: true,
      eventType: data.eventType,
      outreachFound: true,
      requiresClassification: true,
    };
  }

  /**
   * Handle email bounce event
   */
  private async handleEmailBounce(data: WebhookJobData): Promise<WebhookProcessingResult> {
    const outreach = await this.findOutreachByContact(data.objectId);

    if (!outreach) {
      return {
        processed: true,
        eventType: data.eventType,
        outreachFound: false,
      };
    }

    // Update outreach status
    outreach.status = OutreachStatus.BOUNCED;
    await this.outreachRepository.save(outreach);

    this.logger.log(`Updated outreach ${outreach.id} to BOUNCED`);

    return {
      processed: true,
      eventType: data.eventType,
      outreachFound: true,
    };
  }

  /**
   * Handle contact property change event
   */
  private async handleContactPropertyChange(data: WebhookJobData): Promise<WebhookProcessingResult> {
    this.logger.debug(
      `Contact property change: ${data.propertyName} = ${data.propertyValue} for contact ${data.objectId}`,
    );

    // Check if this is an email engagement property
    if (data.propertyName === 'hs_email_last_open_date') {
      return this.handleEmailOpen(data);
    }

    if (data.propertyName === 'hs_email_last_click_date') {
      return this.handleEmailClick(data);
    }

    if (data.propertyName === 'hs_sales_email_last_replied') {
      return this.handleEmailReply(data);
    }

    return {
      processed: true,
      eventType: data.eventType,
    };
  }

  /**
   * Handle deal property change event
   */
  private async handleDealPropertyChange(data: WebhookJobData): Promise<WebhookProcessingResult> {
    this.logger.debug(
      `Deal property change: ${data.propertyName} = ${data.propertyValue} for deal ${data.objectId}`,
    );

    // Track important deal stage changes
    if (data.propertyName === 'dealstage') {
      this.logger.log(
        `Deal ${data.objectId} stage changed to ${data.propertyValue}`,
      );
    }

    return {
      processed: true,
      eventType: data.eventType,
    };
  }

  /**
   * Find the most recent outreach record for a contact
   */
  async findOutreachByContact(contactId: number): Promise<OutreachRecord | null> {
    return this.outreachRepository
      .createQueryBuilder('outreach')
      .where('outreach.hubspotContactId = :contactId', { contactId })
      .orderBy('outreach.sentAt', 'DESC')
      .getOne();
  }

  @OnQueueCompleted()
  override onCompleted(job: Job<WebhookJobData>, result: JobResult): void {
    this.logger.log(`Webhook job ${job.id} completed: ${result.data?.eventType}`);
  }

  @OnQueueFailed()
  override onFailed(job: Job<WebhookJobData>, error: Error): void {
    this.logger.error(`Webhook job ${job.id} failed: ${error.message}`);
  }
}
