import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { AccountId, PortalId } from '../../common/decorators/account.decorator';
import { CampaignService } from '../services/campaign.service';
import { ScannerService } from '../services/scanner.service';
import { DormancyDetectionService } from '../services/dormancy-detection.service';
import { ContactsService } from '../../hubspot/services/contacts.service';
import { CampaignStatus } from '../../entities/campaign.entity';
import { OutreachChannel } from '../../entities/outreach-record.entity';

/**
 * DTO for creating a campaign
 */
interface CreateCampaignDto {
  name: string;
  description?: string;
  channel?: 'email' | 'sms' | 'both';
  ruleId?: string;
  leadIds?: string[];
  contactIds?: string[]; // Alias for leadIds
  tone?: 'professional' | 'friendly' | 'casual';
  scheduledAt?: string;
  enableABTest?: boolean;
}

/**
 * DTO for updating campaign status
 */
interface UpdateCampaignStatusDto {
  status: CampaignStatus;
}

/**
 * Query params for listing campaigns
 */
interface ListCampaignsQuery {
  status?: CampaignStatus;
  ruleId?: string;
}

@Controller('api/accounts/:accountId/campaigns')
export class CampaignsController {
  private readonly logger = new Logger(CampaignsController.name);

  constructor(
    private readonly campaignService: CampaignService,
    private readonly scannerService: ScannerService,
    private readonly dormancyDetectionService: DormancyDetectionService,
    private readonly contactsService: ContactsService,
  ) {}

  /**
   * POST /api/accounts/:accountId/campaigns
   * Create a new campaign
   */
  @Post()
  async createCampaign(
    @AccountId() accountId: string,
    @PortalId() portalId: number,
    @Body() dto: CreateCampaignDto,
  ) {
    // Determine channel (default to email, 'both' treated as email for now)
    const channel = dto.channel === 'sms' ? OutreachChannel.SMS : OutreachChannel.EMAIL;

    // Support both leadIds and contactIds
    let ids = dto.leadIds || dto.contactIds || [];

    // If ruleId is provided but no specific leads, fetch dormant leads for that rule
    if (dto.ruleId && ids.length === 0) {
      this.logger.log(`Fetching dormant leads for rule ${dto.ruleId}`);
      try {
        const scanResult = await this.scannerService.scanForRule(
          accountId,
          portalId,
          dto.ruleId,
          {},
        );

        // Use the contacts from the scan result
        const contacts = scanResult.contacts;

        if (contacts.length === 0) {
          return {
            success: false,
            message: 'No contacts found matching the rule criteria',
            contactsSkipped: 0,
          };
        }

        // Create campaign directly from the scan result (contacts have full properties)
        const result = await this.campaignService.createCampaignFromScan({
          accountId,
          scanResult,
          name: dto.name,
          channel,
        });

        if (!result.campaign) {
          return {
            success: false,
            message: 'No valid contacts for campaign (missing email addresses)',
            contactsSkipped: result.contactsSkipped,
          };
        }

        // Return in format frontend expects
        return {
          id: result.campaign.id,
          name: result.campaign.name,
          description: dto.description || '',
          status: result.campaign.status,
          channel: dto.channel || 'email',
          ruleId: dto.ruleId,
          targetCount: result.outreachRecordsCreated,
          sentCount: 0,
          deliveredCount: 0,
          openCount: 0,
          clickCount: 0,
          replyCount: 0,
          tone: dto.tone || 'professional',
          scheduledAt: dto.scheduledAt,
          createdAt: result.campaign.createdAt?.toISOString(),
          updatedAt: result.campaign.createdAt?.toISOString(),
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Failed to fetch contacts for rule ${dto.ruleId}: ${errorMessage}`);
        return {
          success: false,
          message: `Failed to fetch contacts: ${errorMessage}`,
          contactsSkipped: 0,
        };
      }
    }

    // If no ruleId and no leadIds, return error
    if (ids.length === 0) {
      return {
        success: false,
        message: 'No contacts provided. Either provide leadIds or select a rule.',
        contactsSkipped: 0,
      };
    }

    // Fetch contact details from HubSpot for manually selected leads
    this.logger.log(`Fetching ${ids.length} contacts from HubSpot for manual selection`);

    try {
      const fetchedContacts = await Promise.all(
        ids.map(async (id) => {
          try {
            const contact = await this.contactsService.getContactById(portalId, id);
            if (contact) {
              // Convert properties from Record<string, string | null> to Record<string, string>
              // by filtering out null values
              const properties: Record<string, string> = {};
              for (const [key, value] of Object.entries(contact.properties)) {
                if (value !== null) {
                  properties[key] = value;
                }
              }
              return {
                id: contact.id,
                properties,
                createdAt: contact.createdAt,
                updatedAt: contact.updatedAt,
              };
            }
            this.logger.warn(`Contact ${id} not found in HubSpot`);
            return null;
          } catch (error) {
            this.logger.warn(`Failed to fetch contact ${id}: ${error}`);
            return null;
          }
        }),
      );

      // Filter out null contacts (not found or errors)
      const validContacts = fetchedContacts.filter((c) => c !== null);

      if (validContacts.length === 0) {
        return {
          success: false,
          message: 'No contacts found in HubSpot for the provided IDs',
          contactsSkipped: ids.length,
        };
      }

      // Create scan result with actual contact data
      const scanResult = {
        ruleId: dto.ruleId || 'manual-selection',
        contacts: validContacts,
        totalFound: validContacts.length,
        scannedAt: new Date(),
      };

      const result = await this.campaignService.createCampaignFromScan({
        accountId,
        scanResult,
        name: dto.name,
        channel,
      });

      if (!result.campaign) {
        return {
          success: false,
          message: 'No valid contacts for campaign (missing email addresses)',
          contactsSkipped: result.contactsSkipped,
        };
      }

      // Return in format frontend expects
      return {
        id: result.campaign.id,
        name: result.campaign.name,
        description: dto.description || '',
        status: result.campaign.status,
        channel: dto.channel || 'email',
        ruleId: dto.ruleId,
        targetCount: result.outreachRecordsCreated,
        sentCount: 0,
        deliveredCount: 0,
        openCount: 0,
        clickCount: 0,
        replyCount: 0,
        tone: dto.tone || 'professional',
        scheduledAt: dto.scheduledAt,
        createdAt: result.campaign.createdAt?.toISOString(),
        updatedAt: result.campaign.createdAt?.toISOString(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to create campaign with manual selection: ${errorMessage}`);
      return {
        success: false,
        message: `Failed to fetch contacts from HubSpot: ${errorMessage}`,
        contactsSkipped: ids.length,
      };
    }
  }

  /**
   * GET /api/accounts/:accountId/campaigns
   * List all campaigns for the account
   */
  @Get()
  async listCampaigns(
    @AccountId() accountId: string,
    @Query() query: ListCampaignsQuery,
  ) {
    const campaigns = await this.campaignService.findCampaignsByAccount(accountId, {
      status: query.status,
      ruleId: query.ruleId,
    });

    // Transform to frontend format
    const transformedCampaigns = campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      description: '',
      status: c.status,
      channel: 'email',
      ruleId: c.ruleId,
      targetCount: c.totalContacts,
      sentCount: c.emailsSent,
      deliveredCount: c.emailsSent, // Approximate
      openCount: c.emailsOpened,
      clickCount: 0,
      replyCount: c.emailsReplied,
      tone: 'professional',
      scheduledAt: c.scheduledAt?.toISOString(),
      startedAt: c.startedAt?.toISOString(),
      completedAt: c.completedAt?.toISOString(),
      createdAt: c.createdAt?.toISOString(),
      updatedAt: c.createdAt?.toISOString(), // No updatedAt field
    }));

    return {
      campaigns: transformedCampaigns,
      total: campaigns.length,
      page: 1,
      limit: campaigns.length,
    };
  }

  /**
   * GET /api/accounts/:accountId/campaigns/:campaignId
   * Get a single campaign with its outreach records
   */
  @Get(':campaignId')
  async getCampaign(
    @AccountId() accountId: string,
    @Param('campaignId') campaignId: string,
  ) {
    const result = await this.campaignService.getCampaignWithOutreachRecords(
      accountId,
      campaignId,
    );

    if (!result) {
      throw new NotFoundException(`Campaign ${campaignId} not found`);
    }

    const { campaign: c, outreachRecords } = result;

    // Get real-time progress data
    const progress = await this.campaignService.getCampaignProgress(campaignId);

    // Transform to frontend format
    return {
      id: c.id,
      name: c.name,
      description: '',
      status: c.status,
      channel: 'email',
      ruleId: c.ruleId,
      targetCount: c.totalContacts,
      sentCount: c.emailsSent,
      deliveredCount: c.emailsSent,
      openCount: c.emailsOpened,
      clickCount: 0,
      replyCount: c.emailsReplied,
      tone: 'professional',
      scheduledAt: c.scheduledAt?.toISOString(),
      startedAt: c.startedAt?.toISOString(),
      completedAt: c.completedAt?.toISOString(),
      createdAt: c.createdAt?.toISOString(),
      updatedAt: c.createdAt?.toISOString(), // No updatedAt field
      leads: outreachRecords.map((r) => ({
        id: r.id,
        email: r.contactEmail,
        name: r.contactName || '',
        status: r.status,
        sentAt: r.sentAt?.toISOString(),
      })),
      metrics: {
        openRate: c.totalContacts > 0 ? (c.emailsOpened / c.totalContacts) * 100 : 0,
        clickRate: 0,
        replyRate: c.totalContacts > 0 ? (c.emailsReplied / c.totalContacts) * 100 : 0,
        bounceRate: 0,
      },
      progress,
    };
  }

  /**
   * PATCH /api/accounts/:accountId/campaigns/:campaignId/status
   * Update campaign status
   */
  @Patch(':campaignId/status')
  async updateCampaignStatus(
    @AccountId() accountId: string,
    @Param('campaignId') campaignId: string,
    @Body() dto: UpdateCampaignStatusDto,
  ) {
    const campaign = await this.campaignService.updateCampaignStatus(
      accountId,
      campaignId,
      dto.status,
    );

    if (!campaign) {
      throw new NotFoundException(`Campaign ${campaignId} not found`);
    }

    return { success: true, campaign };
  }

  /**
   * POST /api/accounts/:accountId/campaigns/:campaignId/start
   * Start a draft campaign and queue it for processing
   */
  @Post(':campaignId/start')
  async startCampaign(
    @AccountId() accountId: string,
    @PortalId() portalId: number,
    @Param('campaignId') campaignId: string,
  ) {
    const campaign = await this.campaignService.startCampaign(campaignId, portalId);

    if (!campaign) {
      throw new NotFoundException(`Campaign ${campaignId} not found`);
    }

    // Return in frontend expected format
    return {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      channel: 'email',
      targetCount: campaign.totalContacts,
      sentCount: campaign.emailsSent,
      createdAt: campaign.createdAt?.toISOString(),
      startedAt: campaign.startedAt?.toISOString(),
    };
  }

  /**
   * POST /api/accounts/:accountId/campaigns/:campaignId/resume
   * Resume a paused campaign and queue it for processing
   */
  @Post(':campaignId/resume')
  async resumeCampaign(
    @AccountId() accountId: string,
    @PortalId() portalId: number,
    @Param('campaignId') campaignId: string,
  ) {
    const campaign = await this.campaignService.resumeCampaign(campaignId, portalId);

    if (!campaign) {
      throw new NotFoundException(`Campaign ${campaignId} not found`);
    }

    // Return in frontend expected format
    return {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      channel: 'email',
      targetCount: campaign.totalContacts,
      sentCount: campaign.emailsSent,
      createdAt: campaign.createdAt?.toISOString(),
      startedAt: campaign.startedAt?.toISOString(),
    };
  }

  /**
   * POST /api/accounts/:accountId/campaigns/:campaignId/pause
   * Pause a running campaign
   */
  @Post(':campaignId/pause')
  async pauseCampaign(
    @AccountId() accountId: string,
    @Param('campaignId') campaignId: string,
  ) {
    const campaign = await this.campaignService.pauseCampaign(campaignId);

    if (!campaign) {
      throw new NotFoundException(`Campaign ${campaignId} not found`);
    }

    // Return in frontend expected format
    return {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      channel: 'email',
      targetCount: campaign.totalContacts,
      sentCount: campaign.emailsSent,
      createdAt: campaign.createdAt?.toISOString(),
      startedAt: campaign.startedAt?.toISOString(),
    };
  }

  /**
   * POST /api/accounts/:accountId/campaigns/:campaignId/stop
   * Stop a campaign
   */
  @Post(':campaignId/stop')
  async stopCampaign(
    @AccountId() accountId: string,
    @Param('campaignId') campaignId: string,
  ) {
    const campaign = await this.campaignService.stopCampaign(campaignId);

    if (!campaign) {
      throw new NotFoundException(`Campaign ${campaignId} not found`);
    }

    return { success: true, campaign };
  }

  /**
   * GET /api/accounts/:accountId/campaigns/:campaignId/outreach
   * Get outreach records for a campaign with full message content
   */
  @Get(':campaignId/outreach')
  async getCampaignOutreach(
    @AccountId() accountId: string,
    @Param('campaignId') campaignId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    const records = await this.campaignService.getOutreachRecordsByCampaign(
      accountId,
      campaignId,
    );

    // Filter by status if provided
    let filteredRecords = records;
    if (status) {
      filteredRecords = records.filter((r) => r.status === status);
    }

    // Apply pagination
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 50;
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = startIndex + limitNum;
    const paginatedRecords = filteredRecords.slice(startIndex, endIndex);

    // Transform to frontend format with full message content
    const transformedRecords = paginatedRecords.map((r) => ({
      id: r.id,
      campaignId: r.campaignId,
      hubspotContactId: r.hubspotContactId,
      contactEmail: r.contactEmail,
      contactName: r.contactName || undefined,
      companyName: r.companyName || undefined,
      channel: r.channel,
      subject: r.subject || undefined,
      bodyText: r.bodyText || undefined,
      bodyHtml: r.bodyHtml || undefined,
      status: r.status,
      scheduledAt: r.scheduledAt?.toISOString(),
      sentAt: r.sentAt?.toISOString(),
      openedAt: r.openedAt?.toISOString(),
      clickedAt: r.clickedAt?.toISOString(),
      repliedAt: r.repliedAt?.toISOString(),
      createdAt: r.createdAt?.toISOString(),
      updatedAt: r.updatedAt?.toISOString(),
    }));

    return {
      records: transformedRecords,
      total: filteredRecords.length,
      page: pageNum,
      limit: limitNum,
    };
  }

  /**
   * GET /api/accounts/:accountId/campaigns/:campaignId/outreach/failed
   * Get all failed outreach records for a campaign
   * NOTE: This route MUST be defined before /:recordId to avoid "failed" being treated as a recordId
   */
  @Get(':campaignId/outreach/failed')
  async getFailedOutreach(
    @AccountId() accountId: string,
    @Param('campaignId') campaignId: string,
  ) {
    const records = await this.campaignService.getFailedOutreachRecords(
      accountId,
      campaignId,
    );

    return {
      records: records.map((r) => ({
        id: r.id,
        campaignId: r.campaignId,
        hubspotContactId: r.hubspotContactId,
        contactEmail: r.contactEmail,
        contactName: r.contactName || undefined,
        companyName: r.companyName || undefined,
        channel: r.channel,
        subject: r.subject || undefined,
        status: r.status,
        createdAt: r.createdAt?.toISOString(),
        updatedAt: r.updatedAt?.toISOString(),
      })),
      total: records.length,
    };
  }

  /**
   * GET /api/accounts/:accountId/campaigns/:campaignId/outreach/:recordId
   * Get a single outreach record with full message content
   */
  @Get(':campaignId/outreach/:recordId')
  async getOutreachRecord(
    @AccountId() accountId: string,
    @Param('campaignId') campaignId: string,
    @Param('recordId') recordId: string,
  ) {
    const records = await this.campaignService.getOutreachRecordsByCampaign(
      accountId,
      campaignId,
    );

    const record = records.find((r) => r.id === recordId);

    if (!record) {
      throw new NotFoundException(`Outreach record ${recordId} not found`);
    }

    return {
      id: record.id,
      campaignId: record.campaignId,
      hubspotContactId: record.hubspotContactId,
      contactEmail: record.contactEmail,
      contactName: record.contactName || undefined,
      companyName: record.companyName || undefined,
      channel: record.channel,
      subject: record.subject || undefined,
      bodyText: record.bodyText || undefined,
      bodyHtml: record.bodyHtml || undefined,
      status: record.status,
      scheduledAt: record.scheduledAt?.toISOString(),
      sentAt: record.sentAt?.toISOString(),
      openedAt: record.openedAt?.toISOString(),
      clickedAt: record.clickedAt?.toISOString(),
      repliedAt: record.repliedAt?.toISOString(),
      createdAt: record.createdAt?.toISOString(),
      updatedAt: record.updatedAt?.toISOString(),
    };
  }

  /**
   * POST /api/accounts/:accountId/campaigns/:campaignId/generate
   * Generate AI messages for a campaign without sending
   */
  @Post(':campaignId/generate')
  async generateMessages(
    @AccountId() accountId: string,
    @PortalId() portalId: number,
    @Param('campaignId') campaignId: string,
  ) {
    const result = await this.campaignService.generateCampaignMessages(
      campaignId,
      portalId,
    );

    return {
      success: true,
      message: `Queued ${result.generatedCount} messages for generation`,
      generatedCount: result.generatedCount,
      alreadyGenerated: result.alreadyGenerated,
    };
  }

  /**
   * POST /api/accounts/:accountId/campaigns/:campaignId/outreach/:recordId/approve
   * Approve a single outreach record for sending
   */
  @Post(':campaignId/outreach/:recordId/approve')
  async approveOutreach(
    @AccountId() accountId: string,
    @Param('campaignId') campaignId: string,
    @Param('recordId') recordId: string,
  ) {
    const record = await this.campaignService.approveOutreachRecord(
      accountId,
      campaignId,
      recordId,
    );

    if (!record) {
      throw new NotFoundException(`Outreach record ${recordId} not found`);
    }

    return {
      success: true,
      message: 'Outreach record approved',
      record: {
        id: record.id,
        status: record.status,
        contactEmail: record.contactEmail,
        contactName: record.contactName,
      },
    };
  }

  /**
   * POST /api/accounts/:accountId/campaigns/:campaignId/outreach/approve-all
   * Approve all pending outreach records that have generated content
   */
  @Post(':campaignId/outreach/approve-all')
  async approveAllOutreach(
    @AccountId() accountId: string,
    @Param('campaignId') campaignId: string,
  ) {
    const result = await this.campaignService.approveAllOutreach(
      accountId,
      campaignId,
    );

    return {
      success: true,
      message: `Approved ${result.approvedCount} messages (${result.skippedCount} skipped)`,
      approvedCount: result.approvedCount,
      skippedCount: result.skippedCount,
    };
  }

  /**
   * POST /api/accounts/:accountId/campaigns/:campaignId/send-approved
   * Send only approved messages
   */
  @Post(':campaignId/send-approved')
  async sendApproved(
    @AccountId() accountId: string,
    @PortalId() portalId: number,
    @Param('campaignId') campaignId: string,
  ) {
    const result = await this.campaignService.sendApprovedMessages(
      campaignId,
      portalId,
    );

    return {
      success: true,
      message: `Queued ${result.queuedCount} approved messages for sending`,
      queuedCount: result.queuedCount,
    };
  }

  /**
   * POST /api/accounts/:accountId/campaigns/:campaignId/outreach/:recordId/retry
   * Retry a single failed outreach record
   */
  @Post(':campaignId/outreach/:recordId/retry')
  async retryOutreachRecord(
    @AccountId() accountId: string,
    @PortalId() portalId: number,
    @Param('campaignId') campaignId: string,
    @Param('recordId') recordId: string,
  ) {
    const record = await this.campaignService.retryOutreachRecord(
      accountId,
      campaignId,
      recordId,
      portalId,
    );

    if (!record) {
      throw new NotFoundException(`Outreach record ${recordId} not found`);
    }

    return {
      success: true,
      message: 'Outreach record queued for retry',
      record: {
        id: record.id,
        status: record.status,
        contactEmail: record.contactEmail,
        contactName: record.contactName,
      },
    };
  }

  /**
   * POST /api/accounts/:accountId/campaigns/:campaignId/retry-failed
   * Retry all failed outreach records for a campaign
   */
  @Post(':campaignId/retry-failed')
  async retryAllFailed(
    @AccountId() accountId: string,
    @PortalId() portalId: number,
    @Param('campaignId') campaignId: string,
  ) {
    const result = await this.campaignService.retryAllFailedOutreach(
      accountId,
      campaignId,
      portalId,
    );

    return {
      success: true,
      message: `${result.retriedCount} failed records queued for retry`,
      retriedCount: result.retriedCount,
    };
  }

  /**
   * DELETE /api/accounts/:accountId/campaigns/:campaignId
   * Delete a campaign and its outreach records
   */
  @Delete(':campaignId')
  async deleteCampaign(
    @AccountId() accountId: string,
    @Param('campaignId') campaignId: string,
  ) {
    const deleted = await this.campaignService.deleteCampaign(accountId, campaignId);

    if (!deleted) {
      throw new NotFoundException(`Campaign ${campaignId} not found`);
    }

    return { success: true, message: 'Campaign deleted successfully' };
  }
}
