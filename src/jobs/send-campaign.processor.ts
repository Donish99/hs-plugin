import { Processor, Process, OnQueueCompleted, OnQueueFailed } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { QUEUE_NAMES } from '../config/redis.config';
import { BaseProcessor, JobResult, JobStatus } from './base.processor';

/**
 * Job data for sending campaign messages
 */
export interface SendCampaignJobData {
  campaignId: string;
  outreachRecordId: string;
  channel: 'email' | 'sms';
  contactEmail?: string;
  contactPhone?: string;
}

/**
 * Processor for campaign sending jobs
 * Handles sending emails and SMS messages
 */
@Processor(QUEUE_NAMES.SEND_CAMPAIGN)
export class SendCampaignProcessor extends BaseProcessor<SendCampaignJobData> {
  readonly queueName = QUEUE_NAMES.SEND_CAMPAIGN;
  protected readonly logger = new Logger(SendCampaignProcessor.name);

  @Process()
  async processJob(job: Job<SendCampaignJobData>): Promise<JobResult> {
    const { campaignId, outreachRecordId, channel } = job.data;
    this.logger.log(`Sending ${channel} for campaign ${campaignId}`);

    try {
      // TODO: Implement actual sending logic
      // 1. Fetch outreach record
      // 2. Send via appropriate channel (SendGrid/Twilio)
      // 3. Log activity to HubSpot
      // 4. Update outreach record status

      await job.progress(50);

      return {
        status: JobStatus.COMPLETED,
        message: `${channel} sent successfully`,
        data: {
          campaignId,
          outreachRecordId,
          channel,
          sentAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        status: JobStatus.FAILED,
        message: `Failed to send ${channel}`,
        error: errorMessage,
      };
    }
  }

  @OnQueueCompleted()
  override onCompleted(job: Job<SendCampaignJobData>, result: JobResult): void {
    this.logger.log(`Send job ${job.id} completed: ${result.data?.channel} sent`);
  }

  @OnQueueFailed()
  override onFailed(job: Job<SendCampaignJobData>, error: Error): void {
    this.logger.error(`Send job ${job.id} failed: ${error.message}`);
  }
}
