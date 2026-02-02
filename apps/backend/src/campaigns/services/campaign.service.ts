import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Campaign, CampaignStatus } from '../../entities/campaign.entity';
import {
  OutreachRecord,
  OutreachChannel,
  OutreachStatus,
} from '../../entities/outreach-record.entity';
import { DormancyDetectionService } from './dormancy-detection.service';
import { HubSpotContact, ScanResult } from './scanner.service';

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
   */
  async startCampaign(campaignId: string): Promise<Campaign | null> {
    const campaign = await this.campaignRepository.findOne({
      where: { id: campaignId },
    });

    if (!campaign) {
      return null;
    }

    if (campaign.status === CampaignStatus.RUNNING) {
      return campaign;
    }

    if (!campaign.canTransitionTo(CampaignStatus.RUNNING)) {
      throw new BadRequestException(
        `Cannot start campaign with status ${campaign.status}`,
      );
    }

    campaign.status = CampaignStatus.RUNNING;
    campaign.startedAt = new Date();
    return this.campaignRepository.save(campaign);
  }

  /**
   * Resume a paused campaign
   */
  async resumeCampaign(campaignId: string): Promise<Campaign | null> {
    const campaign = await this.campaignRepository.findOne({
      where: { id: campaignId },
    });

    if (!campaign) {
      return null;
    }

    if (campaign.status === CampaignStatus.RUNNING) {
      return campaign;
    }

    if (campaign.status !== CampaignStatus.PAUSED) {
      throw new BadRequestException(
        `Cannot resume campaign with status ${campaign.status}. Only paused campaigns can be resumed.`,
      );
    }

    campaign.status = CampaignStatus.RUNNING;
    return this.campaignRepository.save(campaign);
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
