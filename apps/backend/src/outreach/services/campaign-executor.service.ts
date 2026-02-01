import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, Between } from 'typeorm';
import { EmailService } from './email.service';
import { SmsService } from './sms.service';
import { HubspotLoggerService } from './hubspot-logger.service';
import { VariantService } from '../../ai/services/variant.service';
import {
  OutreachRecord,
  OutreachStatus,
  OutreachChannel,
} from '../../entities/outreach-record.entity';
import { Campaign, CampaignStatus } from '../../entities/campaign.entity';

export interface ExecutionOptions {
  dailyLimit?: number;
  monthlyLimit?: number;
  rateLimit?: number;
  rateLimitWindowMs?: number;
  businessHoursOnly?: boolean;
  businessHoursStart?: number;
  businessHoursEnd?: number;
  timezone?: string;
  spreadOverMinutes?: number;
  batchSize?: number;
}

export interface ExecutionResult {
  processed: number;
  successful: number;
  failed: number;
  skipped: boolean;
  errors: string[];
}

export interface OutreachResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface QuotaInfo {
  dailyRemaining: number;
  monthlyRemaining: number;
  dailyUsed: number;
  monthlyUsed: number;
}

/**
 * Service for executing campaigns and sending outreach messages
 */
@Injectable()
export class CampaignExecutorService {
  private readonly logger = new Logger(CampaignExecutorService.name);

  constructor(
    private readonly emailService: EmailService,
    private readonly smsService: SmsService,
    private readonly hubspotLogger: HubspotLoggerService,
    private readonly variantService: VariantService,
    @InjectRepository(OutreachRecord)
    private readonly outreachRepository: Repository<OutreachRecord>,
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,
  ) {}

  /**
   * Execute a campaign - process all pending outreach records
   */
  async executeCampaign(
    campaignId: string,
    portalId: number,
    options: ExecutionOptions = {},
  ): Promise<ExecutionResult> {
    const result: ExecutionResult = {
      processed: 0,
      successful: 0,
      failed: 0,
      skipped: false,
      errors: [],
    };

    // Get campaign
    const campaign = await this.campaignRepository.findOne({
      where: { id: campaignId },
    });

    if (!campaign) {
      result.errors.push('Campaign not found');
      return result;
    }

    // Check if campaign is running
    if (campaign.status !== CampaignStatus.RUNNING) {
      result.skipped = true;
      return result;
    }

    // Check business hours
    if (options.businessHoursOnly && !this.isWithinBusinessHours(options)) {
      result.skipped = true;
      return result;
    }

    // Get remaining quota
    const quota = await this.getRemainingQuota(campaign.accountId, options);
    const maxToProcess = Math.min(
      quota.dailyRemaining,
      options.batchSize || 100,
    );

    if (maxToProcess <= 0) {
      result.skipped = true;
      result.errors.push('Daily limit reached');
      return result;
    }

    // Get pending outreach records
    const pendingRecords = await this.getPendingOutreach(campaignId, maxToProcess);

    // Calculate delay between sends if spreading
    const delayMs = options.spreadOverMinutes
      ? (options.spreadOverMinutes * 60 * 1000) / Math.max(pendingRecords.length, 1)
      : 0;

    // Rate limiting
    const rateLimitDelay = options.rateLimit
      ? (options.rateLimitWindowMs || 1000) / options.rateLimit
      : 0;

    const effectiveDelay = Math.max(delayMs, rateLimitDelay);

    // Process each record
    for (const record of pendingRecords) {
      const outreachResult = await this.executeOutreach(record, portalId);

      result.processed++;

      if (outreachResult.success) {
        result.successful++;
        campaign.emailsSent = (campaign.emailsSent || 0) + 1;
      } else {
        result.failed++;
        if (outreachResult.error) {
          result.errors.push(`Contact ${record.hubspotContactId}: ${outreachResult.error}`);
        }
      }

      // Apply delay between sends
      if (effectiveDelay > 0 && result.processed < pendingRecords.length) {
        await this.delay(effectiveDelay);
      }
    }

    // Update campaign statistics
    await this.campaignRepository.save(campaign);

    this.logger.log(
      `Campaign ${campaignId}: processed ${result.processed}, ` +
        `successful ${result.successful}, failed ${result.failed}`,
    );

    return result;
  }

  /**
   * Execute a single outreach record
   */
  async executeOutreach(
    record: OutreachRecord,
    portalId: number,
  ): Promise<OutreachResult> {
    try {
      let sendResult: { success: boolean; messageId?: string; messageSid?: string; error?: string };

      if (record.channel === OutreachChannel.EMAIL) {
        sendResult = await this.emailService.sendEmailWithRetry({
          to: record.contactEmail || '',
          subject: record.subject || '',
          body: record.bodyHtml || record.bodyText || '',
          textBody: record.bodyText,
        });
      } else {
        // SMS channel - would need phone number on the record
        sendResult = await this.smsService.sendSmsWithRetry({
          to: '', // Would come from contact data
          body: record.bodyText || '',
        });
      }

      if (sendResult.success) {
        // Update record status
        record.status = OutreachStatus.SENT;
        record.sentAt = new Date();

        if (record.channel === OutreachChannel.EMAIL) {
          record.sendgridMessageId = sendResult.messageId;
        } else {
          record.twilioMessageSid = sendResult.messageSid;
        }

        await this.outreachRepository.save(record);

        // Log to HubSpot
        if (record.channel === OutreachChannel.EMAIL) {
          await this.hubspotLogger.logEmailSent(portalId, {
            contactId: record.hubspotContactId.toString(),
            subject: record.subject || '',
            body: record.bodyHtml || record.bodyText || '',
            textBody: record.bodyText,
            toEmail: record.contactEmail || '',
            sendgridMessageId: sendResult.messageId,
          });
        } else {
          await this.hubspotLogger.logSmsSent(portalId, {
            contactId: record.hubspotContactId.toString(),
            body: record.bodyText || '',
            toPhone: '', // Would come from contact data
            twilioSid: sendResult.messageSid,
          });
        }

        // Mark variant as sent if applicable
        if (record.variantId) {
          await this.variantService.markVariantAsSent(record.variantId);
        }

        return { success: true, messageId: sendResult.messageId || sendResult.messageSid };
      } else {
        // Update record status to failed
        record.status = OutreachStatus.FAILED;
        await this.outreachRepository.save(record);

        return { success: false, error: sendResult.error };
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      record.status = OutreachStatus.FAILED;
      await this.outreachRepository.save(record);

      this.logger.error(`Outreach execution failed: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Get pending outreach records for a campaign
   */
  async getPendingOutreach(
    campaignId: string,
    limit: number = 100,
  ): Promise<OutreachRecord[]> {
    return this.outreachRepository.find({
      where: {
        campaignId,
        status: OutreachStatus.PENDING,
      },
      order: { createdAt: 'ASC' },
      take: limit,
    });
  }

  /**
   * Check if current time is within business hours
   */
  isWithinBusinessHours(options: ExecutionOptions): boolean {
    const now = new Date();
    const hour = now.getHours(); // For simplicity, using local time

    const start = options.businessHoursStart || 9;
    const end = options.businessHoursEnd || 17;

    return hour >= start && hour < end;
  }

  /**
   * Get next execution window based on business hours
   */
  getNextExecutionWindow(options: ExecutionOptions): Date {
    const now = new Date();
    const start = options.businessHoursStart || 9;
    const hour = now.getHours();

    if (hour < start) {
      // Before business hours today
      now.setHours(start, 0, 0, 0);
    } else {
      // After business hours, schedule for tomorrow
      now.setDate(now.getDate() + 1);
      now.setHours(start, 0, 0, 0);
    }

    return now;
  }

  /**
   * Check if under monthly sending limit
   */
  async checkMonthlyLimit(
    accountId: string,
    options: ExecutionOptions,
  ): Promise<boolean> {
    if (!options.monthlyLimit) return true;

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const sentCount = await this.outreachRepository.count({
      where: {
        accountId,
        status: OutreachStatus.SENT,
        sentAt: MoreThan(startOfMonth),
      },
    });

    return sentCount < options.monthlyLimit;
  }

  /**
   * Check if under daily sending limit
   */
  async checkDailyLimit(
    accountId: string,
    options: ExecutionOptions,
  ): Promise<boolean> {
    if (!options.dailyLimit) return true;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const sentCount = await this.outreachRepository.count({
      where: {
        accountId,
        status: OutreachStatus.SENT,
        sentAt: MoreThan(startOfDay),
      },
    });

    return sentCount < options.dailyLimit;
  }

  /**
   * Get remaining quota for an account
   */
  async getRemainingQuota(
    accountId: string,
    options: ExecutionOptions,
  ): Promise<QuotaInfo> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const dailyUsed = await this.outreachRepository.count({
      where: {
        accountId,
        status: OutreachStatus.SENT,
        sentAt: MoreThan(startOfDay),
      },
    });

    const monthlyUsed = await this.outreachRepository.count({
      where: {
        accountId,
        status: OutreachStatus.SENT,
        sentAt: MoreThan(startOfMonth),
      },
    });

    const dailyLimit = options.dailyLimit || Infinity;
    const monthlyLimit = options.monthlyLimit || Infinity;

    return {
      dailyUsed,
      monthlyUsed,
      dailyRemaining: Math.max(0, dailyLimit - dailyUsed),
      monthlyRemaining: Math.max(0, monthlyLimit - monthlyUsed),
    };
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
