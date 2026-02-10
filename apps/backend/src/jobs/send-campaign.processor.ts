import {
  Processor,
  Process,
  OnQueueCompleted,
  OnQueueFailed,
  InjectQueue,
} from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job, Queue } from 'bull';
import { QUEUE_NAMES } from '../config/redis.config';
import { BaseProcessor, JobResult, JobStatus } from './base.processor';
import { GeneratorService } from '../ai/services/generator.service';
import { VariantService } from '../ai/services/variant.service';
import { ReviewService } from '../ai/services/review.service';
import { EmailService } from '../outreach/services/email.service';
import { SmsService } from '../outreach/services/sms.service';
import { HubspotLoggerService } from '../outreach/services/hubspot-logger.service';
import { EventsService } from '../events/events.service';
import {
  OutreachRecord,
  OutreachStatus,
  OutreachChannel,
} from '../entities/outreach-record.entity';
import { Campaign, CampaignStatus } from '../entities/campaign.entity';

/**
 * Job data for processing an entire campaign
 */
export interface ProcessCampaignJobData {
  type: 'process-campaign';
  campaignId: string;
  accountId: string;
  portalId: number;
}

/**
 * Job data for sending a single message
 */
export interface SendMessageJobData {
  type: 'send-message';
  outreachRecordId: string;
  campaignId: string;
  accountId: string;
  portalId: number;
}

/**
 * Job data for generating messages only (no sending)
 */
export interface GenerateMessagesJobData {
  type: 'generate-messages';
  campaignId: string;
  accountId: string;
  portalId: number;
}

/**
 * Job data for sending only approved messages
 */
export interface SendApprovedJobData {
  type: 'send-approved';
  campaignId: string;
  accountId: string;
  portalId: number;
}

/**
 * Job data for generating a message for review (no immediate send)
 */
export interface GenerateForReviewJobData {
  type: 'generate-for-review';
  outreachRecordId: string;
  campaignId: string;
  accountId: string;
  portalId: number;
}

/**
 * Job data for sending a single approved message after review
 */
export interface SendApprovedSingleJobData {
  type: 'send-approved-single';
  outreachRecordId: string;
  campaignId: string;
  accountId: string;
  portalId: number;
}

/**
 * Union type for all job data types
 */
export type SendCampaignJobData =
  | ProcessCampaignJobData
  | SendMessageJobData
  | GenerateMessagesJobData
  | SendApprovedJobData
  | GenerateForReviewJobData
  | SendApprovedSingleJobData;

/**
 * Processor for campaign sending jobs
 * Handles both campaign orchestration and individual message sending
 */
@Processor(QUEUE_NAMES.SEND_CAMPAIGN)
export class SendCampaignProcessor extends BaseProcessor<SendCampaignJobData> {
  readonly queueName = QUEUE_NAMES.SEND_CAMPAIGN;
  protected readonly logger = new Logger(SendCampaignProcessor.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.SEND_CAMPAIGN)
    private readonly sendCampaignQueue: Queue<SendCampaignJobData>,
    @InjectRepository(OutreachRecord)
    private readonly outreachRepository: Repository<OutreachRecord>,
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,
    private readonly generatorService: GeneratorService,
    private readonly variantService: VariantService,
    private readonly reviewService: ReviewService,
    private readonly emailService: EmailService,
    private readonly smsService: SmsService,
    private readonly hubspotLogger: HubspotLoggerService,
    private readonly eventsService: EventsService,
  ) {
    super();
  }

  /**
   * Main job dispatcher - routes to the appropriate handler based on job name
   */
  async processJob(job: Job<SendCampaignJobData>): Promise<JobResult> {
    // This method is required by BaseProcessor but we use named processors
    // The @Process decorators handle routing to the correct method
    if (job.data.type === 'process-campaign') {
      return this.processCampaign(job as Job<ProcessCampaignJobData>);
    } else if (job.data.type === 'send-message') {
      return this.sendMessage(job as Job<SendMessageJobData>);
    } else if (job.data.type === 'generate-messages') {
      return this.generateMessages(job as Job<GenerateMessagesJobData>);
    } else if (job.data.type === 'send-approved') {
      return this.sendApprovedMessages(job as Job<SendApprovedJobData>);
    } else if (job.data.type === 'generate-for-review') {
      return this.generateForReview(job as Job<GenerateForReviewJobData>);
    } else if (job.data.type === 'send-approved-single') {
      return this.sendApprovedSingle(job as Job<SendApprovedSingleJobData>);
    }

    return {
      status: JobStatus.FAILED,
      message: 'Unknown job type',
      error: `Unknown job type: ${(job.data as { type?: string }).type}`,
    };
  }

  @Process('process-campaign')
  async processCampaign(job: Job<ProcessCampaignJobData>): Promise<JobResult> {
    const { campaignId, accountId, portalId } = job.data;
    this.logger.log(`Processing campaign ${campaignId}`);

    try {
      // Validate campaign exists and is running
      const campaign = await this.campaignRepository.findOne({
        where: { id: campaignId },
      });

      if (!campaign) {
        return {
          status: JobStatus.FAILED,
          message: 'Campaign not found',
          error: `Campaign ${campaignId} not found`,
        };
      }

      if (campaign.status !== CampaignStatus.RUNNING) {
        return {
          status: JobStatus.COMPLETED,
          message: 'Campaign is not running, skipping',
          data: { campaignId, status: campaign.status },
        };
      }

      // Get all pending outreach records for this campaign
      const pendingRecords = await this.outreachRepository.find({
        where: {
          campaignId,
          status: OutreachStatus.PENDING,
        },
        order: { createdAt: 'ASC' },
      });

      this.logger.log(
        `Found ${pendingRecords.length} pending records for campaign ${campaignId}`,
      );

      if (pendingRecords.length === 0) {
        // No pending records, check if campaign should be completed
        // For review-required campaigns, also check pending_review status
        const statusesToCheck = campaign.requiresReview
          ? [OutreachStatus.PENDING, OutreachStatus.PENDING_REVIEW]
          : [OutreachStatus.PENDING];

        const remainingRecords = await this.outreachRepository.count({
          where: statusesToCheck.map((status) => ({ campaignId, status })),
        });

        if (remainingRecords === 0) {
          const allRecords = await this.outreachRepository.count({
            where: { campaignId },
          });

          if (allRecords > 0) {
            // All records processed, mark campaign as completed
            campaign.status = CampaignStatus.COMPLETED;
            campaign.completedAt = new Date();
            await this.campaignRepository.save(campaign);

            this.logger.log(`Campaign ${campaignId} completed - all records processed`);
          }
        }

        return {
          status: JobStatus.COMPLETED,
          message: 'No pending records to process',
          data: { campaignId, pendingCount: 0 },
        };
      }

      // Check if campaign requires review
      if (campaign.requiresReview) {
        // Queue generate-for-review jobs instead of send-message
        let queuedCount = 0;
        for (const record of pendingRecords) {
          const generateJobData: GenerateForReviewJobData = {
            type: 'generate-for-review',
            outreachRecordId: record.id,
            campaignId,
            accountId,
            portalId,
          };

          await this.sendCampaignQueue.add('generate-for-review', generateJobData, {
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 2000,
            },
            delay: queuedCount * 500, // 500ms between each to respect rate limits
          });

          queuedCount++;
        }

        await job.progress(100);

        return {
          status: JobStatus.COMPLETED,
          message: `Queued ${queuedCount} messages for review generation`,
          data: {
            campaignId,
            queuedCount,
            totalPending: pendingRecords.length,
            requiresReview: true,
          },
        };
      }

      // Standard flow: Queue individual send-message jobs for each pending record
      let queuedCount = 0;
      for (const record of pendingRecords) {
        const sendJobData: SendMessageJobData = {
          type: 'send-message',
          outreachRecordId: record.id,
          campaignId,
          accountId,
          portalId,
        };

        await this.sendCampaignQueue.add('send-message', sendJobData, {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          // Add small delay between messages to respect rate limits
          delay: queuedCount * 500, // 500ms between each message
        });

        queuedCount++;
      }

      await job.progress(100);

      return {
        status: JobStatus.COMPLETED,
        message: `Queued ${queuedCount} messages for sending`,
        data: {
          campaignId,
          queuedCount,
          totalPending: pendingRecords.length,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Campaign processing failed: ${errorMessage}`);
      return {
        status: JobStatus.FAILED,
        message: 'Campaign processing failed',
        error: errorMessage,
      };
    }
  }

  @Process('send-message')
  async sendMessage(job: Job<SendMessageJobData>): Promise<JobResult> {
    const { outreachRecordId, campaignId, accountId, portalId } = job.data;
    this.logger.log(`Sending message for outreach record ${outreachRecordId}`);

    try {
      // Fetch the outreach record
      const record = await this.outreachRepository.findOne({
        where: { id: outreachRecordId },
      });

      if (!record) {
        return {
          status: JobStatus.FAILED,
          message: 'Outreach record not found',
          error: `Outreach record ${outreachRecordId} not found`,
        };
      }

      // Skip if already sent or failed
      if (record.status !== OutreachStatus.PENDING) {
        return {
          status: JobStatus.COMPLETED,
          message: `Record already processed (status: ${record.status})`,
          data: { outreachRecordId, status: record.status },
        };
      }

      // Check if campaign is still running
      const campaign = await this.campaignRepository.findOne({
        where: { id: campaignId },
      });

      if (!campaign || campaign.status !== CampaignStatus.RUNNING) {
        return {
          status: JobStatus.COMPLETED,
          message: 'Campaign is not running, skipping message',
          data: { outreachRecordId, campaignStatus: campaign?.status },
        };
      }

      await job.progress(20);

      // Generate message if not already generated
      if (!record.subject || !record.bodyText) {
        try {
          // Emit message generating event
          this.eventsService.emitMessageGenerating(campaignId, {
            outreachRecordId,
            contactEmail: record.contactEmail,
            contactName: record.contactName,
          });

          const generated = await this.generatorService.generateMessage(
            accountId,
            portalId,
            record.hubspotContactId.toString(),
          );

          record.subject = generated.message.subject;
          record.bodyText = generated.message.body;
          record.bodyHtml = this.convertToHtml(generated.message.body);
          record.aiModel = 'gpt-4o';
          record.aiPromptTokens = generated.usage.promptTokens;
          record.aiCompletionTokens = generated.usage.completionTokens;

          await this.outreachRepository.save(record);

          // Emit message generated event
          this.eventsService.emitMessageGenerated(campaignId, {
            outreachRecordId,
            contactEmail: record.contactEmail,
            contactName: record.contactName,
            subject: record.subject,
            tokensUsed: generated.usage.promptTokens + generated.usage.completionTokens,
          });

          this.logger.log(
            `Generated message for contact ${record.hubspotContactId}: "${record.subject}"`,
          );
        } catch (genError) {
          const errorMessage =
            genError instanceof Error ? genError.message : 'Unknown error';
          this.logger.error(`AI generation failed: ${errorMessage}`);

          // Mark as failed and continue
          record.status = OutreachStatus.FAILED;
          await this.outreachRepository.save(record);

          // Emit message failed event
          this.eventsService.emitMessageFailed(campaignId, {
            outreachRecordId,
            contactEmail: record.contactEmail,
            contactName: record.contactName,
            channel: record.channel === OutreachChannel.EMAIL ? 'email' : 'sms',
            error: `AI generation failed: ${errorMessage}`,
          });

          return {
            status: JobStatus.FAILED,
            message: 'AI message generation failed',
            error: errorMessage,
          };
        }
      }

      await job.progress(50);

      // Send the message
      let sendResult: {
        success: boolean;
        messageId?: string;
        messageSid?: string;
        error?: string;
      };

      if (record.channel === OutreachChannel.EMAIL) {
        if (!record.contactEmail) {
          record.status = OutreachStatus.FAILED;
          await this.outreachRepository.save(record);
          return {
            status: JobStatus.FAILED,
            message: 'No email address for contact',
            error: 'Missing contact email',
          };
        }

        sendResult = await this.emailService.sendEmailWithRetry({
          to: record.contactEmail,
          subject: record.subject || '',
          body: record.bodyHtml || record.bodyText || '',
          textBody: record.bodyText,
        });
      } else {
        // SMS channel
        sendResult = await this.smsService.sendSmsWithRetry({
          to: '', // Would need phone from contact data
          body: record.bodyText || '',
        });
      }

      await job.progress(80);

      if (sendResult.success) {
        // Update record with success status
        record.status = OutreachStatus.SENT;
        record.sentAt = new Date();

        if (record.channel === OutreachChannel.EMAIL) {
          record.sendgridMessageId = sendResult.messageId;
        } else {
          record.twilioMessageSid = sendResult.messageSid;
        }

        await this.outreachRepository.save(record);

        // Emit message sent event
        this.eventsService.emitMessageSent(campaignId, {
          outreachRecordId,
          contactEmail: record.contactEmail,
          contactName: record.contactName,
          channel: record.channel === OutreachChannel.EMAIL ? 'email' : 'sms',
          messageId: sendResult.messageId || sendResult.messageSid,
          sentAt: record.sentAt.toISOString(),
        });

        // Update campaign statistics
        await this.campaignRepository.increment(
          { id: campaignId },
          'emailsSent',
          1,
        );

        // Log to HubSpot
        try {
          if (record.channel === OutreachChannel.EMAIL) {
            await this.hubspotLogger.logEmailSent(portalId, {
              contactId: record.hubspotContactId.toString(),
              subject: record.subject || '',
              body: record.bodyHtml || record.bodyText || '',
              textBody: record.bodyText,
              toEmail: record.contactEmail || '',
              sendgridMessageId: sendResult.messageId,
              campaignId,
            });
          } else {
            await this.hubspotLogger.logSmsSent(portalId, {
              contactId: record.hubspotContactId.toString(),
              body: record.bodyText || '',
              toPhone: '', // Would come from contact data
              twilioSid: sendResult.messageSid,
            });
          }
        } catch (logError) {
          // Log but don't fail the job - message was sent successfully
          this.logger.warn(
            `Failed to log to HubSpot: ${logError instanceof Error ? logError.message : 'Unknown error'}`,
          );
        }

        // Check if this was the last pending record
        const remainingPending = await this.outreachRepository.count({
          where: {
            campaignId,
            status: OutreachStatus.PENDING,
          },
        });

        if (remainingPending === 0) {
          // All records processed, mark campaign as completed
          const updatedCampaign = await this.campaignRepository.findOne({
            where: { id: campaignId },
          });

          if (updatedCampaign && updatedCampaign.status === CampaignStatus.RUNNING) {
            updatedCampaign.status = CampaignStatus.COMPLETED;
            updatedCampaign.completedAt = new Date();
            await this.campaignRepository.save(updatedCampaign);

            // Get final counts for completed event
            const [sentCount, failedCount] = await Promise.all([
              this.outreachRepository.count({
                where: { campaignId, status: OutreachStatus.SENT },
              }),
              this.outreachRepository.count({
                where: [
                  { campaignId, status: OutreachStatus.FAILED },
                  { campaignId, status: OutreachStatus.BOUNCED },
                ],
              }),
            ]);

            // Emit campaign completed event
            this.eventsService.emitCampaignCompleted(campaignId, {
              total: sentCount + failedCount,
              sent: sentCount,
              failed: failedCount,
              completedAt: updatedCampaign.completedAt.toISOString(),
            });

            this.logger.log(`Campaign ${campaignId} completed - all messages sent`);
          }
        }

        await job.progress(100);

        return {
          status: JobStatus.COMPLETED,
          message: `${record.channel} sent successfully`,
          data: {
            outreachRecordId,
            channel: record.channel,
            messageId: sendResult.messageId || sendResult.messageSid,
            sentAt: record.sentAt?.toISOString(),
          },
        };
      } else {
        // Sending failed
        record.status = OutreachStatus.FAILED;
        await this.outreachRepository.save(record);

        // Emit message failed event
        this.eventsService.emitMessageFailed(campaignId, {
          outreachRecordId,
          contactEmail: record.contactEmail,
          contactName: record.contactName,
          channel: record.channel === OutreachChannel.EMAIL ? 'email' : 'sms',
          error: sendResult.error || 'Unknown send error',
        });

        return {
          status: JobStatus.FAILED,
          message: `Failed to send ${record.channel}`,
          error: sendResult.error,
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Send message failed: ${errorMessage}`);

      // Try to mark the record as failed
      try {
        await this.outreachRepository.update(
          { id: outreachRecordId },
          { status: OutreachStatus.FAILED },
        );
      } catch {
        // Ignore update failure
      }

      return {
        status: JobStatus.FAILED,
        message: 'Send message failed',
        error: errorMessage,
      };
    }
  }

  /**
   * Generate messages for a campaign without sending
   */
  @Process('generate-messages')
  async generateMessages(job: Job<GenerateMessagesJobData>): Promise<JobResult> {
    const { campaignId, accountId, portalId } = job.data;
    this.logger.log(`Generating messages for campaign ${campaignId}`);

    try {
      // Get all pending records that need content generation
      const records = await this.outreachRepository.find({
        where: {
          campaignId,
          status: OutreachStatus.PENDING,
        },
      });

      const needsGeneration = records.filter((r) => !r.subject || !r.bodyText);
      let generatedCount = 0;

      for (const record of needsGeneration) {
        try {
          // Emit generating event
          this.eventsService.emitMessageGenerating(campaignId, {
            outreachRecordId: record.id,
            contactEmail: record.contactEmail,
            contactName: record.contactName,
          });

          const generated = await this.generatorService.generateMessage(
            accountId,
            portalId,
            record.hubspotContactId.toString(),
          );

          record.subject = generated.message.subject;
          record.bodyText = generated.message.body;
          record.bodyHtml = this.convertToHtml(generated.message.body);
          record.aiModel = 'gpt-4o';
          record.aiPromptTokens = generated.usage.promptTokens;
          record.aiCompletionTokens = generated.usage.completionTokens;

          await this.outreachRepository.save(record);

          // Emit generated event
          this.eventsService.emitMessageGenerated(campaignId, {
            outreachRecordId: record.id,
            contactEmail: record.contactEmail,
            contactName: record.contactName,
            subject: record.subject,
            tokensUsed: generated.usage.promptTokens + generated.usage.completionTokens,
          });

          generatedCount++;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(`Failed to generate message for record ${record.id}: ${errorMessage}`);
          // Continue with next record
        }
      }

      return {
        status: JobStatus.COMPLETED,
        message: `Generated ${generatedCount} messages`,
        data: {
          campaignId,
          generatedCount,
          total: needsGeneration.length,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Message generation failed: ${errorMessage}`);
      return {
        status: JobStatus.FAILED,
        message: 'Message generation failed',
        error: errorMessage,
      };
    }
  }

  /**
   * Send only approved messages for a campaign
   */
  @Process('send-approved')
  async sendApprovedMessages(job: Job<SendApprovedJobData>): Promise<JobResult> {
    const { campaignId, accountId, portalId } = job.data;
    this.logger.log(`Sending approved messages for campaign ${campaignId}`);

    try {
      // Get all approved records
      const approvedRecords = await this.outreachRepository.find({
        where: {
          campaignId,
          status: OutreachStatus.APPROVED,
        },
        order: { createdAt: 'ASC' },
      });

      if (approvedRecords.length === 0) {
        return {
          status: JobStatus.COMPLETED,
          message: 'No approved records to send',
          data: { campaignId, queuedCount: 0 },
        };
      }

      // Update status to pending for processing
      for (const record of approvedRecords) {
        record.status = OutreachStatus.PENDING;
      }
      await this.outreachRepository.save(approvedRecords);

      // Queue individual send-message jobs
      let queuedCount = 0;
      for (const record of approvedRecords) {
        const sendJobData: SendMessageJobData = {
          type: 'send-message',
          outreachRecordId: record.id,
          campaignId,
          accountId,
          portalId,
        };

        await this.sendCampaignQueue.add('send-message', sendJobData, {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          delay: queuedCount * 500,
        });

        queuedCount++;
      }

      return {
        status: JobStatus.COMPLETED,
        message: `Queued ${queuedCount} approved messages for sending`,
        data: {
          campaignId,
          queuedCount,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Send approved failed: ${errorMessage}`);
      return {
        status: JobStatus.FAILED,
        message: 'Send approved failed',
        error: errorMessage,
      };
    }
  }

  /**
   * Generate a message for review (doesn't send immediately)
   * Creates a MessageVariant and queues it for human review
   */
  @Process('generate-for-review')
  async generateForReview(job: Job<GenerateForReviewJobData>): Promise<JobResult> {
    const { outreachRecordId, campaignId, accountId, portalId } = job.data;
    this.logger.log(`Generating message for review: outreach record ${outreachRecordId}`);

    try {
      // Fetch the outreach record
      const record = await this.outreachRepository.findOne({
        where: { id: outreachRecordId },
      });

      if (!record) {
        return {
          status: JobStatus.FAILED,
          message: 'Outreach record not found',
          error: `Outreach record ${outreachRecordId} not found`,
        };
      }

      // Skip if already processed
      if (record.status !== OutreachStatus.PENDING) {
        return {
          status: JobStatus.COMPLETED,
          message: `Record already processed (status: ${record.status})`,
          data: { outreachRecordId, status: record.status },
        };
      }

      // Check if campaign is still running
      const campaign = await this.campaignRepository.findOne({
        where: { id: campaignId },
      });

      if (!campaign || campaign.status !== CampaignStatus.RUNNING) {
        return {
          status: JobStatus.COMPLETED,
          message: 'Campaign is not running, skipping',
          data: { outreachRecordId, campaignStatus: campaign?.status },
        };
      }

      await job.progress(20);

      // Emit message generating event
      this.eventsService.emitMessageGenerating(campaignId, {
        outreachRecordId,
        contactEmail: record.contactEmail,
        contactName: record.contactName,
      });

      // Generate the message
      const generated = await this.generatorService.generateMessage(
        accountId,
        portalId,
        record.hubspotContactId.toString(),
      );

      await job.progress(60);

      // Store the message content on the outreach record
      record.subject = generated.message.subject;
      record.bodyText = generated.message.body;
      record.bodyHtml = this.convertToHtml(generated.message.body);
      record.aiModel = 'gpt-4o';
      record.aiPromptTokens = generated.usage.promptTokens;
      record.aiCompletionTokens = generated.usage.completionTokens;
      record.status = OutreachStatus.PENDING_REVIEW;

      await this.outreachRepository.save(record);

      // Create a MessageVariant for the review queue
      const variantResult = await this.variantService.storeVariants(
        accountId,
        record.hubspotContactId,
        [
          {
            tone: 'professional',
            subject: generated.message.subject,
            body: generated.message.body,
            promptTokens: generated.usage.promptTokens,
            completionTokens: generated.usage.completionTokens,
          },
        ],
        { aiModel: 'gpt-4o' },
      );

      // Link the variant to the outreach record
      record.variantId = variantResult.variants[0].id;
      record.variantGroupId = variantResult.variantGroupId;
      await this.outreachRepository.save(record);

      await job.progress(80);

      // Queue for human review
      await this.reviewService.queueForReview(accountId, {
        variantId: variantResult.variants[0].id,
        campaignId,
        contactName: record.contactName,
        contactEmail: record.contactEmail,
        companyName: record.companyName,
        priority: 0,
      });

      // Emit message generated event
      this.eventsService.emitMessageGenerated(campaignId, {
        outreachRecordId,
        contactEmail: record.contactEmail,
        contactName: record.contactName,
        subject: record.subject,
        tokensUsed: generated.usage.promptTokens + generated.usage.completionTokens,
      });

      await job.progress(100);

      this.logger.log(
        `Generated message for review: contact ${record.hubspotContactId}, variant ${variantResult.variants[0].id}`,
      );

      return {
        status: JobStatus.COMPLETED,
        message: 'Message generated and queued for review',
        data: {
          outreachRecordId,
          variantId: variantResult.variants[0].id,
          variantGroupId: variantResult.variantGroupId,
          subject: generated.message.subject,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Generate for review failed: ${errorMessage}`);

      // Try to mark the record as failed
      try {
        await this.outreachRepository.update(
          { id: outreachRecordId },
          { status: OutreachStatus.FAILED },
        );
      } catch {
        // Ignore update failure
      }

      // Emit message failed event
      this.eventsService.emitMessageFailed(campaignId, {
        outreachRecordId,
        contactEmail: undefined,
        contactName: undefined,
        channel: 'email',
        error: `Generation failed: ${errorMessage}`,
      });

      return {
        status: JobStatus.FAILED,
        message: 'Generate for review failed',
        error: errorMessage,
      };
    }
  }

  /**
   * Send a single approved message after human review
   */
  @Process('send-approved-single')
  async sendApprovedSingle(job: Job<SendApprovedSingleJobData>): Promise<JobResult> {
    const { outreachRecordId, campaignId, accountId, portalId } = job.data;
    this.logger.log(`Sending approved message for outreach record ${outreachRecordId}`);

    try {
      // Fetch the outreach record
      const record = await this.outreachRepository.findOne({
        where: { id: outreachRecordId },
      });

      if (!record) {
        return {
          status: JobStatus.FAILED,
          message: 'Outreach record not found',
          error: `Outreach record ${outreachRecordId} not found`,
        };
      }

      // Verify the record is approved
      if (record.status !== OutreachStatus.APPROVED) {
        return {
          status: JobStatus.COMPLETED,
          message: `Record not in approved state (status: ${record.status})`,
          data: { outreachRecordId, status: record.status },
        };
      }

      // Verify message content exists
      if (!record.subject || !record.bodyText) {
        record.status = OutreachStatus.FAILED;
        await this.outreachRepository.save(record);
        return {
          status: JobStatus.FAILED,
          message: 'No message content to send',
          error: 'Missing subject or body text',
        };
      }

      await job.progress(20);

      // Check if campaign is still running
      const campaign = await this.campaignRepository.findOne({
        where: { id: campaignId },
      });

      if (!campaign || campaign.status !== CampaignStatus.RUNNING) {
        return {
          status: JobStatus.COMPLETED,
          message: 'Campaign is not running, skipping message',
          data: { outreachRecordId, campaignStatus: campaign?.status },
        };
      }

      await job.progress(40);

      // Send the message
      let sendResult: {
        success: boolean;
        messageId?: string;
        messageSid?: string;
        error?: string;
      };

      if (record.channel === OutreachChannel.EMAIL) {
        if (!record.contactEmail) {
          record.status = OutreachStatus.FAILED;
          await this.outreachRepository.save(record);
          return {
            status: JobStatus.FAILED,
            message: 'No email address for contact',
            error: 'Missing contact email',
          };
        }

        sendResult = await this.emailService.sendEmailWithRetry({
          to: record.contactEmail,
          subject: record.subject,
          body: record.bodyHtml || record.bodyText,
          textBody: record.bodyText,
        });
      } else {
        // SMS channel
        sendResult = await this.smsService.sendSmsWithRetry({
          to: '', // Would need phone from contact data
          body: record.bodyText,
        });
      }

      await job.progress(70);

      if (sendResult.success) {
        // Update record with success status
        record.status = OutreachStatus.SENT;
        record.sentAt = new Date();

        if (record.channel === OutreachChannel.EMAIL) {
          record.sendgridMessageId = sendResult.messageId;
        } else {
          record.twilioMessageSid = sendResult.messageSid;
        }

        await this.outreachRepository.save(record);

        // Mark variant as sent if linked
        if (record.variantId) {
          await this.variantService.markVariantAsSent(record.variantId);
        }

        // Emit message sent event
        this.eventsService.emitMessageSent(campaignId, {
          outreachRecordId,
          contactEmail: record.contactEmail,
          contactName: record.contactName,
          channel: record.channel === OutreachChannel.EMAIL ? 'email' : 'sms',
          messageId: sendResult.messageId || sendResult.messageSid,
          sentAt: record.sentAt.toISOString(),
        });

        // Update campaign statistics
        await this.campaignRepository.increment(
          { id: campaignId },
          'emailsSent',
          1,
        );

        // Log to HubSpot
        try {
          if (record.channel === OutreachChannel.EMAIL) {
            await this.hubspotLogger.logEmailSent(portalId, {
              contactId: record.hubspotContactId.toString(),
              subject: record.subject,
              body: record.bodyHtml || record.bodyText,
              textBody: record.bodyText,
              toEmail: record.contactEmail || '',
              sendgridMessageId: sendResult.messageId,
              campaignId,
            });
          } else {
            await this.hubspotLogger.logSmsSent(portalId, {
              contactId: record.hubspotContactId.toString(),
              body: record.bodyText,
              toPhone: '', // Would come from contact data
              twilioSid: sendResult.messageSid,
            });
          }
        } catch (logError) {
          // Log but don't fail - message was sent successfully
          this.logger.warn(
            `Failed to log to HubSpot: ${logError instanceof Error ? logError.message : 'Unknown error'}`,
          );
        }

        await job.progress(90);

        // Check if campaign should be completed
        const remainingPending = await this.outreachRepository.count({
          where: [
            { campaignId, status: OutreachStatus.PENDING },
            { campaignId, status: OutreachStatus.PENDING_REVIEW },
            { campaignId, status: OutreachStatus.APPROVED },
          ],
        });

        if (remainingPending === 0) {
          const updatedCampaign = await this.campaignRepository.findOne({
            where: { id: campaignId },
          });

          if (updatedCampaign && updatedCampaign.status === CampaignStatus.RUNNING) {
            updatedCampaign.status = CampaignStatus.COMPLETED;
            updatedCampaign.completedAt = new Date();
            await this.campaignRepository.save(updatedCampaign);

            // Get final counts for completed event
            const [sentCount, failedCount] = await Promise.all([
              this.outreachRepository.count({
                where: { campaignId, status: OutreachStatus.SENT },
              }),
              this.outreachRepository.count({
                where: [
                  { campaignId, status: OutreachStatus.FAILED },
                  { campaignId, status: OutreachStatus.BOUNCED },
                ],
              }),
            ]);

            // Emit campaign completed event
            this.eventsService.emitCampaignCompleted(campaignId, {
              total: sentCount + failedCount,
              sent: sentCount,
              failed: failedCount,
              completedAt: updatedCampaign.completedAt.toISOString(),
            });

            this.logger.log(`Campaign ${campaignId} completed - all approved messages sent`);
          }
        }

        await job.progress(100);

        return {
          status: JobStatus.COMPLETED,
          message: `${record.channel} sent successfully after review approval`,
          data: {
            outreachRecordId,
            channel: record.channel,
            messageId: sendResult.messageId || sendResult.messageSid,
            sentAt: record.sentAt?.toISOString(),
          },
        };
      } else {
        // Sending failed
        record.status = OutreachStatus.FAILED;
        await this.outreachRepository.save(record);

        // Emit message failed event
        this.eventsService.emitMessageFailed(campaignId, {
          outreachRecordId,
          contactEmail: record.contactEmail,
          contactName: record.contactName,
          channel: record.channel === OutreachChannel.EMAIL ? 'email' : 'sms',
          error: sendResult.error || 'Unknown send error',
        });

        return {
          status: JobStatus.FAILED,
          message: `Failed to send ${record.channel}`,
          error: sendResult.error,
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Send approved single failed: ${errorMessage}`);

      // Try to mark the record as failed
      try {
        await this.outreachRepository.update(
          { id: outreachRecordId },
          { status: OutreachStatus.FAILED },
        );
      } catch {
        // Ignore update failure
      }

      return {
        status: JobStatus.FAILED,
        message: 'Send approved single failed',
        error: errorMessage,
      };
    }
  }

  /**
   * Convert plain text to HTML with basic formatting
   */
  private convertToHtml(text: string): string {
    if (!text) return '';

    // Escape HTML entities
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Convert newlines to <br> and wrap in paragraphs
    const paragraphs = html.split(/\n\n+/);
    html = paragraphs
      .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
      .join('\n');

    return html;
  }

  @OnQueueCompleted()
  override onCompleted(job: Job<SendCampaignJobData>, result: JobResult): void {
    const jobType = job.name || 'unknown';
    this.logger.log(
      `Job ${job.id} (${jobType}) completed: ${result.message || result.status}`,
    );
  }

  @OnQueueFailed()
  override onFailed(job: Job<SendCampaignJobData>, error: Error): void {
    const jobType = job.name || 'unknown';
    this.logger.error(
      `Job ${job.id} (${jobType}) failed after ${job.attemptsMade} attempts: ${error.message}`,
    );
  }
}
