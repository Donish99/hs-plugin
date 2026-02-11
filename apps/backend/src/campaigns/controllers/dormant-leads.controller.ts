import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Res,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { AccountId, PortalId } from '../../common/decorators/account.decorator';
import { Response } from 'express';
import { ScannerService, HubSpotContact, ScanResult } from '../services/scanner.service';
import {
  DormancyDetectionService,
  PrioritizedContact,
  DormancyReport,
  PrioritizationOptions,
} from '../services/dormancy-detection.service';
import { DormancyRulesService } from '../services/dormancy-rules.service';
import { CampaignService, CampaignCreationResult } from '../services/campaign.service';

/**
 * Query parameters for listing dormant leads
 */
interface ListDormantLeadsQuery {
  ruleId?: string;
  sortBy?: 'dormancyScore' | 'leadScore' | 'dealValue' | 'recency' | 'composite';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

/**
 * DTO for creating campaign from dormant leads
 */
interface CreateCampaignDto {
  contactIds: string[];
  name?: string;
  deduplicate?: boolean;
}

/**
 * DTO for bulk selection criteria
 */
interface BulkSelectDto {
  minDormancyScore?: number;
  minLeadScore?: number;
  minDealValue?: number;
  maxContacts?: number;
  ruleId?: string;
}

/**
 * Response for paginated list
 */
interface PaginatedResponse<T> {
  contacts: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Response for contact details
 */
interface ContactDetailsResponse {
  contactId: string;
  contact: HubSpotContact;
  dormancyScore: PrioritizedContact['dormancyScore'];
  engagementData: ReturnType<DormancyDetectionService['getContactEngagementData']>;
}

/**
 * Response for bulk selection
 */
interface BulkSelectResponse {
  selectedContacts: PrioritizedContact[];
  selectedContactIds: string[];
  totalMatched: number;
}

@Controller('api/accounts/:accountId/dormant-leads')
export class DormantLeadsController {
  private readonly logger = new Logger(DormantLeadsController.name);

  constructor(
    private readonly scannerService: ScannerService,
    private readonly dormancyDetectionService: DormancyDetectionService,
    private readonly rulesService: DormancyRulesService,
    private readonly campaignService: CampaignService,
  ) {}

  /**
   * GET /api/accounts/:accountId/dormant-leads
   * List dormant leads with filtering and sorting
   */
  @Get()
  async getDormantLeads(
    @AccountId() accountId: string,
    @PortalId() portalId: number,
    @Query() query: ListDormantLeadsQuery,
  ): Promise<PaginatedResponse<PrioritizedContact>> {
    const { ruleId, sortBy = 'dormancyScore', sortOrder = 'desc', page = 1, limit = 20 } = query;

    // Get scan results
    let scanResults: ScanResult[];

    if (ruleId) {
      const rule = await this.rulesService.findOne(accountId, ruleId);
      if (!rule) {
        throw new NotFoundException(`Rule ${ruleId} not found`);
      }
      const result = await this.scannerService.scanForRule(accountId, portalId, ruleId, {});
      scanResults = [result];
    } else {
      scanResults = await this.scannerService.scanAllRules(accountId, portalId, {});
    }

    // Combine contacts from all scan results, tagging each with its matched rule
    const allContacts: HubSpotContact[] = [];
    for (const sr of scanResults) {
      let ruleName = 'Unknown';
      try {
        const rule = await this.rulesService.findOne(accountId, sr.ruleId);
        ruleName = rule.name;
      } catch {
        // Rule may have been deleted
      }
      for (const contact of sr.contacts) {
        contact.properties._matchedRuleId = sr.ruleId;
        contact.properties._matchedRuleName = ruleName;
        allContacts.push(contact);
      }
    }

    if (allContacts.length === 0) {
      return {
        contacts: [],
        total: 0,
        page,
        limit,
        totalPages: 0,
      };
    }

    // Prioritize contacts
    const prioritizationOptions: PrioritizationOptions = {
      sortBy,
      sortOrder,
    };

    const prioritizedContacts = this.dormancyDetectionService.prioritizeContacts(
      allContacts,
      prioritizationOptions,
    );

    // Apply pagination
    const startIndex = (page - 1) * limit;
    const paginatedContacts = prioritizedContacts.slice(startIndex, startIndex + limit);

    return {
      contacts: paginatedContacts,
      total: prioritizedContacts.length,
      page,
      limit,
      totalPages: Math.ceil(prioritizedContacts.length / limit),
    };
  }

  /**
   * GET /api/accounts/:accountId/dormant-leads/:contactId
   * Get detailed information about a specific dormant lead
   */
  @Get(':contactId')
  async getDormantLeadDetails(
    @AccountId() accountId: string,
    @PortalId() portalId: number,
    @Param('contactId') contactId: string,
  ): Promise<ContactDetailsResponse> {
    // Scan to find the contact, preserving rule association
    const scanResults = await this.scannerService.scanAllRules(accountId, portalId, {});
    const allContacts: HubSpotContact[] = [];
    for (const sr of scanResults) {
      let ruleName = 'Unknown';
      try {
        const rule = await this.rulesService.findOne(accountId, sr.ruleId);
        ruleName = rule.name;
      } catch {
        // Rule may have been deleted
      }
      for (const contact of sr.contacts) {
        contact.properties._matchedRuleId = sr.ruleId;
        contact.properties._matchedRuleName = ruleName;
        allContacts.push(contact);
      }
    }

    const contact = allContacts.find((c) => c.id === contactId);
    if (!contact) {
      throw new NotFoundException(`Contact ${contactId} not found in dormant leads`);
    }

    const dormancyScore = this.dormancyDetectionService.calculateDormancyScore(contact);
    const engagementData = this.dormancyDetectionService.getContactEngagementData(contact);

    return {
      contactId,
      contact,
      dormancyScore,
      engagementData,
    };
  }

  /**
   * GET /api/accounts/:accountId/dormant-leads/report/:ruleId
   * Get dormancy report for a specific rule
   */
  @Get('report/:ruleId')
  async getDormancyReport(
    @AccountId() accountId: string,
    @PortalId() portalId: number,
    @Param('ruleId') ruleId: string,
  ): Promise<DormancyReport> {
    const rule = await this.rulesService.findOne(accountId, ruleId);
    if (!rule) {
      throw new NotFoundException(`Rule ${ruleId} not found`);
    }

    const scanResult = await this.scannerService.scanForRule(accountId, portalId, ruleId, {});
    return this.dormancyDetectionService.generateDormancyReport(ruleId, scanResult.contacts);
  }

  /**
   * POST /api/accounts/:accountId/dormant-leads/campaign
   * Create a campaign from selected dormant leads
   */
  @Post('campaign')
  async createCampaignFromDormantLeads(
    @AccountId() accountId: string,
    @PortalId() portalId: number,
    @Body() dto: CreateCampaignDto,
  ): Promise<CampaignCreationResult> {
    const { contactIds, name, deduplicate = false } = dto;

    if (!contactIds || contactIds.length === 0) {
      throw new BadRequestException('At least one contact ID is required');
    }

    // Scan to get all contacts
    const scanResults = await this.scannerService.scanAllRules(accountId, portalId, {});
    const allContacts = scanResults.flatMap((r) => r.contacts);

    // Filter to only selected contacts
    let selectedContacts = allContacts.filter((c) => contactIds.includes(c.id));

    // Deduplicate if requested
    if (deduplicate) {
      selectedContacts = await this.campaignService.deduplicateContacts(
        accountId,
        selectedContacts,
      );
    }

    // Create scan result for campaign creation
    const scanResult: ScanResult = {
      ruleId: 'manual-selection',
      contacts: selectedContacts,
      totalFound: selectedContacts.length,
      scannedAt: new Date(),
    };

    return this.campaignService.createCampaignFromScan({
      accountId,
      scanResult,
      name,
    });
  }

  /**
   * GET /api/accounts/:accountId/dormant-leads/export
   * Export dormant leads as CSV
   */
  @Get('export/csv')
  async exportDormantLeads(
    @AccountId() accountId: string,
    @PortalId() portalId: number,
    @Query() query: ListDormantLeadsQuery,
    @Res() res: Response,
  ): Promise<void> {
    const { ruleId, sortBy = 'dormancyScore', sortOrder = 'desc' } = query;

    // Get scan results
    let scanResults: ScanResult[];

    if (ruleId) {
      const result = await this.scannerService.scanForRule(accountId, portalId, ruleId, {});
      scanResults = [result];
    } else {
      scanResults = await this.scannerService.scanAllRules(accountId, portalId, {});
    }

    // Tag contacts with matched rule info
    const allContacts: HubSpotContact[] = [];
    for (const sr of scanResults) {
      let ruleName = 'Unknown';
      try {
        const rule = await this.rulesService.findOne(accountId, sr.ruleId);
        ruleName = rule.name;
      } catch {
        // Rule may have been deleted
      }
      for (const contact of sr.contacts) {
        contact.properties._matchedRuleId = sr.ruleId;
        contact.properties._matchedRuleName = ruleName;
        allContacts.push(contact);
      }
    }

    const prioritizedContacts = this.dormancyDetectionService.prioritizeContacts(allContacts, {
      sortBy,
      sortOrder,
    });

    // Generate CSV
    const csvHeaders = [
      'Contact ID',
      'Email',
      'Name',
      'Company',
      'Dormancy Score',
      'Lead Score',
      'Deal Value',
      'Days Since Last Contact',
      'Priority Score',
    ];

    const csvRows = prioritizedContacts.map((p) => {
      const engagement = this.dormancyDetectionService.getContactEngagementData(p.contact);
      return [
        p.contact.id,
        engagement.email,
        engagement.name,
        engagement.company || '',
        p.dormancyScore.totalScore.toString(),
        p.leadScore.toString(),
        p.dealValue.toString(),
        engagement.daysSinceLastContact?.toString() || 'N/A',
        p.priorityScore.toString(),
      ]
        .map((field) => `"${field.replace(/"/g, '""')}"`)
        .join(',');
    });

    const csv = [csvHeaders.join(','), ...csvRows].join('\n');

    const filename = `dormant-leads-${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send(csv);
  }

  /**
   * POST /api/accounts/:accountId/dormant-leads/bulk-select
   * Get contacts matching bulk selection criteria
   */
  @Post('bulk-select')
  async bulkSelectDormantLeads(
    @AccountId() accountId: string,
    @PortalId() portalId: number,
    @Body() dto: BulkSelectDto,
  ): Promise<BulkSelectResponse> {
    const { minDormancyScore = 0, minLeadScore = 0, minDealValue = 0, maxContacts, ruleId } = dto;

    // Get scan results
    let scanResults: ScanResult[];

    if (ruleId) {
      const result = await this.scannerService.scanForRule(accountId, portalId, ruleId, {});
      scanResults = [result];
    } else {
      scanResults = await this.scannerService.scanAllRules(accountId, portalId, {});
    }

    // Tag contacts with matched rule info
    const allContacts: HubSpotContact[] = [];
    for (const sr of scanResults) {
      let ruleName = 'Unknown';
      try {
        const rule = await this.rulesService.findOne(accountId, sr.ruleId);
        ruleName = rule.name;
      } catch {
        // Rule may have been deleted
      }
      for (const contact of sr.contacts) {
        contact.properties._matchedRuleId = sr.ruleId;
        contact.properties._matchedRuleName = ruleName;
        allContacts.push(contact);
      }
    }

    const prioritizedContacts = this.dormancyDetectionService.prioritizeContacts(allContacts, {
      sortBy: 'composite',
      sortOrder: 'desc',
    });

    // Apply filters
    let filteredContacts = prioritizedContacts.filter(
      (p) =>
        p.dormancyScore.totalScore >= minDormancyScore &&
        p.leadScore >= minLeadScore &&
        p.dealValue >= minDealValue,
    );

    // Apply max limit
    if (maxContacts && maxContacts > 0) {
      filteredContacts = filteredContacts.slice(0, maxContacts);
    }

    return {
      selectedContacts: filteredContacts,
      selectedContactIds: filteredContacts.map((p) => p.contact.id),
      totalMatched: filteredContacts.length,
    };
  }
}
