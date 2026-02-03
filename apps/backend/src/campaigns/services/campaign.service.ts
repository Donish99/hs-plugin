import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Repository, In } from 'typeorm';
import { Queue } from 'bull';
import { Campaign, CampaignStatus } from '../../entities/campaign.entity';
import {
  OutreachRecord,
  OutreachChannel,
  OutreachStatus,
} from '../../entities/outreach-record.entity';
import { DormancyDetectionService } from './dormancy-detection.service';
import { HubSpotContact, ScanResult } from './scanner.service';
import { QUEUE_NAMES } from '../../config/redis.config';
import { SendCampaignJobData, ProcessCampaignJobData } from '../../jobs/send-campaign.processor';

/**
 * DTO for creating a campaign from scan results
 */
export interface CreateCampaignFromScanDto {
  accountId: string;
  scanResult: ScanResult;
  name?: string;
  channel?: OutreachChannel;
}

/**
 * Result of campaign creation
 */
export interface CampaignCreationResult {
  campaign: Campaign | null;
  outreachRecordsCreated: number;
  contactsSkipped: number;
}

/**
 * Options for filtering campaigns
 */
export interface CampaignFilterOptions {
  status?: CampaignStatus;
  ruleId?: string;
}

/**
 * Options for filtering outreach records
 */
export interface OutreachFilterOptions {
  status?: OutreachStatus;
  channel?: OutreachChannel;
}

/**
 * Campaign with outreach records
 */
export interface CampaignWithOutreach {
  campaign: Campaign;
  outreachRecords: OutreachRecord[];
}

/**
 * Campaign progress data for real-time updates
 */
export interface CampaignProgress {
  total: number;
  pending: number;
  sent: number;
  failed: number;
  generating: number;
  percentComplete: number;
}

// Statuses that indicate an active (not completed) outreach
const ACTIVE_OUTREACH_STATUSES = [
  OutreachStatus.PENDING,
  OutreachStatus.APPROVED,
  OutreachStatus.SENT,
  OutreachStatus.DELIVERED,
  OutreachStatus.OPENED,
  OutreachStatus.CLICKED,
];

@Injectable()
export class CampaignService {
  private readonly logger = new Logger(CampaignService.name);

  constructor(
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,
    @InjectRepository(OutreachRecord)
    private readonly outreachRepository: Repository<OutreachRecord>,
    private readonly dormancyDetectionService: DormancyDetectionService,
    @InjectQueue(QUEUE_NAMES.SEND_CAMPAIGN)
    private readonly sendCampaignQueue: Queue<SendCampaignJobData>,
  ) {}

  /**
   * Create a campaign from scan results
   */
  async createCampaignFromScan(dto: CreateCampaignFromScanDto): Promise<CampaignCreationResult> {
    const { accountId, scanResult, name, channel = OutreachChannel.EMAIL } = dto;

    // Handle empty scan results
    if (scanResult.contacts.length === 0) {
      return {
        campaign: null,
        outreachRecordsCreated: 0,
        contactsSkipped: 0,
      };
    }

    // Filter contacts - for email channel, require email address
    const validContacts = this.filterValidContacts(scanResult.contacts, channel);
    const contactsSkipped = scanResult.contacts.length - validContacts.length;

    if (validContacts.length === 0) {
      return {
        campaign: null,
        outreachRecordsCreated: 0,
        contactsSkipped,
      };
    }

    // Generate campaign name if not provided
    const campaignName = name || `Dormancy Campaign - ${new Date().toISOString().split('T')[0]}`;

    // Create campaign entity
    const campaign = this.campaignRepository.create({
      accountId,
      ruleId: scanResult.ruleId,
      name: campaignName,
      status: CampaignStatus.DRAFT,
      totalContacts: validContacts.length,
    });

    const savedCampaign = await this.campaignRepository.save(campaign);

    // Create outreach records for each contact
    const outreachRecords = validContacts.map((contact) =>
      this.createOutreachRecordFromContact(savedCampaign.id, accountId, contact, channel),
    );

    await this.outreachRepository.save(outreachRecords);

    this.logger.log(
      `Created campaign ${savedCampaign.id} with ${outreachRecords.length} outreach records`,
    );

    return {
      campaign: savedCampaign,
      outreachRecordsCreated: outreachRecords.length,
      contactsSkipped,
    };
  }

  /**
   * Create campaigns from multiple scan results
   */
  async createCampaignsFromMultipleScans(
    accountId: string,
    scanResults: ScanResult[],
    channel: OutreachChannel = OutreachChannel.EMAIL,
  ): Promise<CampaignCreationResult[]> {
    const results: CampaignCreationResult[] = [];

    for (const scanResult of scanResults) {
      const result = await this.createCampaignFromScan({
        accountId,
        scanResult,
        channel,
      });
      results.push(result);
    }

    return results;
  }

  /**
   * Find campaigns for an account
   */
  async findCampaignsByAccount(
    accountId: string,
    options?: CampaignFilterOptions,
  ): Promise<Campaign[]> {
    const where: Record<string, unknown> = { accountId };

    if (options?.status) {
      where.status = options.status;
    }

    if (options?.ruleId) {
      where.ruleId = options.ruleId;
    }

    return this.campaignRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get a campaign with its outreach records
   */
  async getCampaignWithOutreachRecords(
    accountId: string,
    campaignId: string,
  ): Promise<CampaignWithOutreach | null> {
    const campaign = await this.campaignRepository.findOne({
      where: { id: campaignId, accountId },
    });

    if (!campaign) {
      return null;
    }

    const outreachRecords = await this.outreachRepository.find({
      where: { campaignId, accountId },
      order: { createdAt: 'ASC' },
    });

    return { campaign, outreachRecords };
  }

  /**
   * Update campaign status
   */
  async updateCampaignStatus(
    accountId: string,
    campaignId: string,
    newStatus: CampaignStatus,
  ): Promise<Campaign | null> {
    const campaign = await this.campaignRepository.findOne({
      where: { id: campaignId, accountId },
    });

    if (!campaign) {
      return null;
    }

    if (!campaign.canTransitionTo(newStatus)) {
      throw new BadRequestException(
        `Invalid status transition from ${campaign.status} to ${newStatus}`,
      );
    }

    campaign.status = newStatus;

    // Set timestamps based on status
    if (newStatus === CampaignStatus.RUNNING && !campaign.startedAt) {
      campaign.startedAt = new Date();
    }

    if (newStatus === CampaignStatus.COMPLETED) {
      campaign.completedAt = new Date();
    }

    return this.campaignRepository.save(campaign);
  }

  /**
   * Get outreach records for a campaign
   */
  async getOutreachRecordsByCampaign(
    accountId: string,
    campaignId: string,
    options?: OutreachFilterOptions,
  ): Promise<OutreachRecord[]> {
    const where: Record<string, unknown> = { campaignId, accountId };

    if (options?.status) {
      where.status = options.status;
    }

    if (options?.channel) {
      where.channel = options.channel;
    }

    return this.outreachRepository.find({
      where,
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Start a campaign (transition from DRAFT to RUNNING)
   * Optionally queues the campaign for processing if portalId is provided
   */
  async startCampaign(campaignId: string, portalId?: number): Promise<Campaign | null> {
    const campaign = await this.campaignRepository.findOne({
      where: { id: campaignId },
    });

    if (!campaign) {
      return null;
    }

    if (campaign.status === CampaignStatus.RUNNING) {
      // Campaign already running - queue processing if portalId provided and not already processing
      if (portalId) {
        await this.queueCampaignProcessing(campaign, portalId);
      }
      return campaign;
    }

    if (!campaign.canTransitionTo(CampaignStatus.RUNNING)) {
      throw new BadRequestException(
        `Cannot start campaign with status ${campaign.status}`,
      );
    }

    campaign.status = CampaignStatus.RUNNING;
    campaign.startedAt = new Date();
    const savedCampaign = await this.campaignRepository.save(campaign);

    // Queue the campaign for processing
    if (portalId) {
      await this.queueCampaignProcessing(savedCampaign, portalId);
    }

    return savedCampaign;
  }

  /**
   * Queue a campaign for processing
   */
  private async queueCampaignProcessing(campaign: Campaign, portalId: number): Promise<void> {
    const jobData: ProcessCampaignJobData = {
      type: 'process-campaign',
      campaignId: campaign.id,
      accountId: campaign.accountId,
      portalId,
    };

    await this.sendCampaignQueue.add('process-campaign', jobData, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    });

    this.logger.log(`Queued campaign ${campaign.id} for processing`);
  }

  /**
   * Resume a paused campaign
   * Optionally queues the campaign for processing if portalId is provided
   */
  async resumeCampaign(campaignId: string, portalId?: number): Promise<Campaign | null> {
    const campaign = await this.campaignRepository.findOne({
      where: { id: campaignId },
    });

    if (!campaign) {
      return null;
    }

    if (campaign.status === CampaignStatus.RUNNING) {
      // Campaign already running - queue processing if portalId provided
      if (portalId) {
        await this.queueCampaignProcessing(campaign, portalId);
      }
      return campaign;
    }

    if (campaign.status !== CampaignStatus.PAUSED) {
      throw new BadRequestException(
        `Cannot resume campaign with status ${campaign.status}. Only paused campaigns can be resumed.`,
      );
    }

    campaign.status = CampaignStatus.RUNNING;
    const savedCampaign = await this.campaignRepository.save(campaign);

    // Queue the campaign for processing
    if (portalId) {
      await this.queueCampaignProcessing(savedCampaign, portalId);
    }

    return savedCampaign;
  }

  /**
   * Pause a campaign
   */
  async pauseCampaign(campaignId: string): Promise<Campaign | null> {
    const campaign = await this.campaignRepository.findOne({
      where: { id: campaignId },
    });

    if (!campaign) {
      return null;
    }

    if (campaign.status === CampaignStatus.PAUSED) {
      return campaign;
    }

    if (!campaign.canTransitionTo(CampaignStatus.PAUSED)) {
      throw new BadRequestException(
        `Cannot pause campaign with status ${campaign.status}`,
      );
    }

    campaign.status = CampaignStatus.PAUSED;
    return this.campaignRepository.save(campaign);
  }

  /**
   * Stop a campaign
   */
  async stopCampaign(campaignId: string): Promise<Campaign | null> {
    const campaign = await this.campaignRepository.findOne({
      where: { id: campaignId },
    });

    if (!campaign) {
      return null;
    }

    if (campaign.status === CampaignStatus.COMPLETED) {
      return campaign;
    }

    // Force transition to completed (stopped)
    campaign.status = CampaignStatus.COMPLETED;
    campaign.completedAt = new Date();
    return this.campaignRepository.save(campaign);
  }

  /**
   * Remove contacts that already have active outreach
   */
  async deduplicateContacts(
    accountId: string,
    contacts: HubSpotContact[],
  ): Promise<HubSpotContact[]> {
    if (contacts.length === 0) {
      return [];
    }

    const contactIds = contacts.map((c) => parseInt(c.id, 10));

    // Find existing active outreach records for these contacts
    const existingOutreach = await this.outreachRepository.find({
      where: {
        accountId,
        hubspotContactId: In(contactIds),
        status: In(ACTIVE_OUTREACH_STATUSES),
      },
    });

    const existingContactIds = new Set(existingOutreach.map((o) => o.hubspotContactId));

    // Filter out contacts with active outreach
    return contacts.filter((c) => !existingContactIds.has(parseInt(c.id, 10)));
  }

  /**
   * Filter contacts valid for the specified channel
   */
  private filterValidContacts(
    contacts: HubSpotContact[],
    channel: OutreachChannel,
  ): HubSpotContact[] {
    if (channel === OutreachChannel.EMAIL) {
      return contacts.filter((c) => c.properties.email && c.properties.email.trim() !== '');
    }

    if (channel === OutreachChannel.SMS) {
      return contacts.filter((c) => c.properties.phone && c.properties.phone.trim() !== '');
    }

    return contacts;
  }

  /**
   * Calculate campaign progress from outreach records
   */
  async getCampaignProgress(campaignId: string): Promise<CampaignProgress> {
    const records = await this.outreachRepository.find({
      where: { campaignId },
      select: ['status'],
    });

    const total = records.length;
    let pending = 0;
    let sent = 0;
    let failed = 0;
    let generating = 0;

    for (const record of records) {
      switch (record.status) {
        case OutreachStatus.PENDING:
          pending++;
          break;
        case OutreachStatus.APPROVED:
          generating++;
          break;
        case OutreachStatus.SENT:
        case OutreachStatus.DELIVERED:
        case OutreachStatus.OPENED:
        case OutreachStatus.CLICKED:
        case OutreachStatus.REPLIED:
          sent++;
          break;
        case OutreachStatus.FAILED:
        case OutreachStatus.BOUNCED:
          failed++;
          break;
      }
    }

    const processed = sent + failed;
    const percentComplete = total > 0 ? Math.round((processed / total) * 100) : 0;

    return {
      total,
      pending,
      sent,
      failed,
      generating,
      percentComplete,
    };
  }

  /**
   * Delete a campaign and its associated outreach records
   */
  async deleteCampaign(accountId: string, campaignId: string): Promise<boolean> {
    const campaign = await this.campaignRepository.findOne({
      where: { id: campaignId, accountId },
    });

    if (!campaign) {
      return false;
    }

    // Delete associated outreach records first
    await this.outreachRepository.delete({ campaignId, accountId });

    // Delete the campaign
    await this.campaignRepository.delete({ id: campaignId, accountId });

    this.logger.log(`Deleted campaign ${campaignId} and its outreach records`);

    return true;
  }

  /**
   * Generate AI messages for a campaign without sending
   * This is used for the pre-send review workflow
   */
  async generateCampaignMessages(
    campaignId: string,
    portalId: number,
  ): Promise<{ generatedCount: number; alreadyGenerated: number }> {
    const records = await this.outreachRepository.find({
      where: { campaignId, status: OutreachStatus.PENDING },
    });

    let generatedCount = 0;
    let alreadyGenerated = 0;

    for (const record of records) {
      if (record.subject && record.bodyText) {
        alreadyGenerated++;
        continue;
      }
      generatedCount++;
    }

    // Queue a generation job (we'll handle this in a processor)
    const campaign = await this.campaignRepository.findOne({
      where: { id: campaignId },
    });

    if (campaign) {
      // Queue the campaign for generation only (not sending)
      await this.sendCampaignQueue.add(
        'generate-messages',
        {
          type: 'generate-messages' as const,
          campaignId,
          accountId: campaign.accountId,
          portalId,
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
        },
      );
    }

    return { generatedCount, alreadyGenerated };
  }

  /**
   * Approve a single outreach record for sending
   */
  async approveOutreachRecord(
    accountId: string,
    campaignId: string,
    recordId: string,
  ): Promise<OutreachRecord | null> {
    const record = await this.outreachRepository.findOne({
      where: { id: recordId, campaignId, accountId },
    });

    if (!record) {
      return null;
    }

    if (record.status !== OutreachStatus.PENDING) {
      throw new BadRequestException(`Cannot approve record with status ${record.status}`);
    }

    if (!record.subject || !record.bodyText) {
      throw new BadRequestException('Cannot approve record without generated message content');
    }

    record.status = OutreachStatus.APPROVED;
    return this.outreachRepository.save(record);
  }

  /**
   * Approve all pending outreach records that have generated content
   */
  async approveAllOutreach(
    accountId: string,
    campaignId: string,
  ): Promise<{ approvedCount: number; skippedCount: number }> {
    const records = await this.outreachRepository.find({
      where: { campaignId, accountId, status: OutreachStatus.PENDING },
    });

    let approvedCount = 0;
    let skippedCount = 0;

    for (const record of records) {
      if (record.subject && record.bodyText) {
        record.status = OutreachStatus.APPROVED;
        approvedCount++;
      } else {
        skippedCount++;
      }
    }

    if (approvedCount > 0) {
      await this.outreachRepository.save(records.filter((r) => r.status === OutreachStatus.APPROVED));
    }

    return { approvedCount, skippedCount };
  }

  /**
   * Send only approved messages
   */
  async sendApprovedMessages(
    campaignId: string,
    portalId: number,
  ): Promise<{ queuedCount: number }> {
    const campaign = await this.campaignRepository.findOne({
      where: { id: campaignId },
    });

    if (!campaign) {
      throw new BadRequestException('Campaign not found');
    }

    const approvedRecords = await this.outreachRepository.find({
      where: { campaignId, status: OutreachStatus.APPROVED },
    });

    if (approvedRecords.length === 0) {
      return { queuedCount: 0 };
    }

    // Update campaign status to running if not already
    if (campaign.status !== CampaignStatus.RUNNING) {
      campaign.status = CampaignStatus.RUNNING;
      campaign.startedAt = campaign.startedAt || new Date();
      await this.campaignRepository.save(campaign);
    }

    // Queue sending job
    await this.sendCampaignQueue.add(
      'send-approved',
      {
        type: 'send-approved' as const,
        campaignId,
        accountId: campaign.accountId,
        portalId,
      },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      },
    );

    return { queuedCount: approvedRecords.length };
  }

  /**
   * Retry a single failed outreach record
   */
  async retryOutreachRecord(
    accountId: string,
    campaignId: string,
    recordId: string,
    portalId: number,
  ): Promise<OutreachRecord | null> {
    const record = await this.outreachRepository.findOne({
      where: { id: recordId, campaignId, accountId },
    });

    if (!record) {
      return null;
    }

    if (record.status !== OutreachStatus.FAILED && record.status !== OutreachStatus.BOUNCED) {
      throw new BadRequestException(`Cannot retry record with status ${record.status}`);
    }

    // Reset status to pending
    record.status = OutreachStatus.PENDING;
    await this.outreachRepository.save(record);

    // Ensure campaign is running
    const campaign = await this.campaignRepository.findOne({
      where: { id: campaignId, accountId },
    });

    if (campaign && campaign.status !== CampaignStatus.RUNNING) {
      // Start the campaign if it's not running
      await this.startCampaign(campaignId, portalId);
    } else if (campaign) {
      // Re-queue processing if campaign is already running
      await this.queueCampaignProcessing(campaign, portalId);
    }

    return record;
  }

  /**
   * Retry all failed outreach records for a campaign
   */
  async retryAllFailedOutreach(
    accountId: string,
    campaignId: string,
    portalId: number,
  ): Promise<{ retriedCount: number }> {
    const failedRecords = await this.outreachRepository.find({
      where: [
        { campaignId, accountId, status: OutreachStatus.FAILED },
        { campaignId, accountId, status: OutreachStatus.BOUNCED },
      ],
    });

    if (failedRecords.length === 0) {
      return { retriedCount: 0 };
    }

    // Reset all failed records to pending
    for (const record of failedRecords) {
      record.status = OutreachStatus.PENDING;
    }
    await this.outreachRepository.save(failedRecords);

    // Ensure campaign is running and queue processing
    const campaign = await this.campaignRepository.findOne({
      where: { id: campaignId, accountId },
    });

    if (campaign) {
      if (campaign.status === CampaignStatus.COMPLETED) {
        // Reset to running if completed
        campaign.status = CampaignStatus.RUNNING;
        campaign.completedAt = undefined;
        await this.campaignRepository.save(campaign);
      }
      await this.queueCampaignProcessing(campaign, portalId);
    }

    this.logger.log(`Retried ${failedRecords.length} failed outreach records for campaign ${campaignId}`);

    return { retriedCount: failedRecords.length };
  }

  /**
   * Get failed outreach records for a campaign
   */
  async getFailedOutreachRecords(
    accountId: string,
    campaignId: string,
  ): Promise<OutreachRecord[]> {
    return this.outreachRepository.find({
      where: [
        { campaignId, accountId, status: OutreachStatus.FAILED },
        { campaignId, accountId, status: OutreachStatus.BOUNCED },
      ],
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Create an outreach record from a HubSpot contact
   */
  private createOutreachRecordFromContact(
    campaignId: string,
    accountId: string,
    contact: HubSpotContact,
    channel: OutreachChannel,
  ): OutreachRecord {
    const props = contact.properties;
    const firstName = props.firstname || '';
    const lastName = props.lastname || '';
    const contactName = [firstName, lastName].filter(Boolean).join(' ');

    return this.outreachRepository.create({
      campaignId,
      accountId,
      hubspotContactId: parseInt(contact.id, 10),
      contactEmail: props.email,
      contactName: contactName || undefined,
      companyName: props.company,
      channel,
      status: OutreachStatus.PENDING,
    });
  }
}
