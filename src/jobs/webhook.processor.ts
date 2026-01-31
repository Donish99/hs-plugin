import { Processor, Process, OnQueueCompleted, OnQueueFailed } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { QUEUE_NAMES } from '../config/redis.config';
import { BaseProcessor, JobResult, JobStatus } from './base.processor';

/**
 * HubSpot webhook event types
 */
export type WebhookEventType =
  | 'contact.propertyChange'
  | 'contact.creation'
  | 'contact.deletion'
  | 'deal.propertyChange'
  | 'deal.creation';

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

/**
 * Processor for HubSpot webhook events
 * Handles contact property changes, deal updates, etc.
 */
@Processor(QUEUE_NAMES.WEBHOOK_PROCESS)
export class WebhookProcessor extends BaseProcessor<WebhookJobData> {
  readonly queueName = QUEUE_NAMES.WEBHOOK_PROCESS;
  protected readonly logger = new Logger(WebhookProcessor.name);

  @Process()
  async processJob(job: Job<WebhookJobData>): Promise<JobResult> {
    const { eventType, portalId, objectId, propertyName } = job.data;
    this.logger.log(`Processing webhook: ${eventType} for portal ${portalId}`);

    try {
      // TODO: Implement actual webhook processing
      // 1. Match event to outreach records
      // 2. Update tracking status (opened, clicked, replied)
      // 3. Trigger response classification if reply
      // 4. Execute automated actions

      await job.progress(50);

      return {
        status: JobStatus.COMPLETED,
        message: `Webhook processed: ${eventType}`,
        data: {
          eventType,
          portalId,
          objectId,
          propertyName,
          processedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        status: JobStatus.FAILED,
        message: `Failed to process webhook: ${eventType}`,
        error: errorMessage,
      };
    }
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
