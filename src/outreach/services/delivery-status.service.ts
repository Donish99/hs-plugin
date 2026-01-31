import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OutreachRecord, OutreachStatus } from '../../entities/outreach-record.entity';
import { Campaign } from '../../entities/campaign.entity';
import { HubspotLoggerService } from './hubspot-logger.service';

export interface SendGridEvent {
  event: string;
  sg_message_id: string;
  timestamp: number;
  email: string;
  url?: string;
  reason?: string;
  type?: string;
  category?: string[];
}

export interface TwilioStatusUpdate {
  MessageSid: string;
  MessageStatus: string;
  To: string;
  From: string;
  ErrorCode?: string;
  ErrorMessage?: string;
}

export interface WebhookResult {
  processed: number;
  skipped: number;
  errors: string[];
}

export interface StatusUpdateResult {
  success: boolean;
  error?: string;
}

/**
 * Service for tracking delivery status from email/SMS providers
 */
@Injectable()
export class DeliveryStatusService {
  private readonly logger = new Logger(DeliveryStatusService.name);

  constructor(
    @InjectRepository(OutreachRecord)
    private readonly outreachRepository: Repository<OutreachRecord>,
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,
    private readonly hubspotLogger: HubspotLoggerService,
  ) {}

  /**
   * Process SendGrid webhook events
   */
  async processSendGridWebhook(
    events: SendGridEvent[],
    portalId: number,
  ): Promise<WebhookResult> {
    const result: WebhookResult = {
      processed: 0,
      skipped: 0,
      errors: [],
    };

    for (const event of events) {
      try {
        const record = await this.outreachRepository.findOne({
          where: { sendgridMessageId: event.sg_message_id },
        });

        if (!record) {
          result.skipped++;
          continue;
        }

        const newStatus = this.mapSendGridEventToStatus(event.event);

        if (!newStatus) {
          result.skipped++;
          continue;
        }

        // Update record status and timestamps
        record.status = newStatus;

        switch (event.event) {
          case 'open':
            record.openedAt = new Date(event.timestamp * 1000);
            break;
          case 'click':
            record.clickedAt = new Date(event.timestamp * 1000);
            break;
        }

        await this.outreachRepository.save(record);

        // Handle bounce - log to HubSpot
        if (event.event === 'bounce') {
          await this.hubspotLogger.logBounce(portalId, {
            contactId: record.hubspotContactId.toString(),
            email: event.email,
            reason: event.reason || 'Unknown',
            bounceType: event.type === 'hard' ? 'hard' : 'soft',
          });
        }

        // Update campaign statistics
        if (record.campaignId) {
          await this.updateCampaignStats(record.campaignId, event.event);
        }

        result.processed++;
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`Event ${event.event}: ${errorMessage}`);
      }
    }

    this.logger.log(
      `SendGrid webhook: processed ${result.processed}, skipped ${result.skipped}`,
    );

    return result;
  }

  /**
   * Process Twilio status webhook
   */
  async processTwilioWebhook(
    update: TwilioStatusUpdate,
    portalId: number,
  ): Promise<StatusUpdateResult> {
    try {
      const record = await this.outreachRepository.findOne({
        where: { twilioMessageSid: update.MessageSid },
      });

      if (!record) {
        return { success: false, error: 'Message not found' };
      }

      const newStatus = this.mapTwilioStatusToOutreachStatus(update.MessageStatus);
      record.status = newStatus;

      await this.outreachRepository.save(record);

      this.logger.log(
        `Twilio status update: ${update.MessageSid} -> ${update.MessageStatus}`,
      );

      return { success: true };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Twilio webhook error: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Map SendGrid event type to outreach status
   */
  mapSendGridEventToStatus(event: string): OutreachStatus | null {
    const statusMap: Record<string, OutreachStatus> = {
      processed: OutreachStatus.SENT,
      delivered: OutreachStatus.DELIVERED,
      open: OutreachStatus.OPENED,
      click: OutreachStatus.CLICKED,
      bounce: OutreachStatus.BOUNCED,
      dropped: OutreachStatus.FAILED,
      deferred: OutreachStatus.PENDING,
      spamreport: OutreachStatus.FAILED,
      unsubscribe: OutreachStatus.FAILED,
    };

    return statusMap[event] || null;
  }

  /**
   * Map Twilio message status to outreach status
   */
  mapTwilioStatusToOutreachStatus(status: string): OutreachStatus {
    const statusMap: Record<string, OutreachStatus> = {
      queued: OutreachStatus.PENDING,
      sending: OutreachStatus.PENDING,
      sent: OutreachStatus.SENT,
      delivered: OutreachStatus.DELIVERED,
      failed: OutreachStatus.FAILED,
      undelivered: OutreachStatus.FAILED,
    };

    return statusMap[status] || OutreachStatus.PENDING;
  }

  /**
   * Get current status of an outreach record
   */
  async getOutreachStatus(outreachId: string): Promise<OutreachStatus | null> {
    const record = await this.outreachRepository.findOne({
      where: { id: outreachId },
    });

    return record?.status || null;
  }

  /**
   * Mark an outreach as replied (usually from response detection)
   */
  async markAsReplied(outreachId: string): Promise<StatusUpdateResult> {
    try {
      const record = await this.outreachRepository.findOne({
        where: { id: outreachId },
      });

      if (!record) {
        return { success: false, error: 'Outreach not found' };
      }

      record.status = OutreachStatus.REPLIED;
      record.repliedAt = new Date();

      await this.outreachRepository.save(record);

      // Update campaign statistics
      if (record.campaignId) {
        const campaign = await this.campaignRepository.findOne({
          where: { id: record.campaignId },
        });

        if (campaign) {
          campaign.emailsReplied = (campaign.emailsReplied || 0) + 1;
          await this.campaignRepository.save(campaign);
        }
      }

      return { success: true };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Update campaign statistics based on event type
   */
  private async updateCampaignStats(
    campaignId: string,
    event: string,
  ): Promise<void> {
    const campaign = await this.campaignRepository.findOne({
      where: { id: campaignId },
    });

    if (!campaign) return;

    switch (event) {
      case 'open':
        campaign.emailsOpened = (campaign.emailsOpened || 0) + 1;
        break;
      case 'click':
        // Could track clicks separately if needed
        break;
      case 'spamreport':
      case 'unsubscribe':
        // Could track unsubscribes separately
        break;
    }

    await this.campaignRepository.save(campaign);
  }

  /**
   * Get delivery statistics for a campaign
   */
  async getCampaignDeliveryStats(campaignId: string): Promise<{
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    failed: number;
    replied: number;
  }> {
    const records = await this.outreachRepository.find({
      where: { campaignId },
      select: ['status'],
    });

    const stats = {
      sent: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      bounced: 0,
      failed: 0,
      replied: 0,
    };

    for (const record of records) {
      switch (record.status) {
        case OutreachStatus.SENT:
          stats.sent++;
          break;
        case OutreachStatus.DELIVERED:
          stats.delivered++;
          break;
        case OutreachStatus.OPENED:
          stats.opened++;
          break;
        case OutreachStatus.CLICKED:
          stats.clicked++;
          break;
        case OutreachStatus.BOUNCED:
          stats.bounced++;
          break;
        case OutreachStatus.FAILED:
          stats.failed++;
          break;
        case OutreachStatus.REPLIED:
          stats.replied++;
          break;
      }
    }

    return stats;
  }
}
