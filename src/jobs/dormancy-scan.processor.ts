import { Processor, Process, OnQueueCompleted, OnQueueFailed } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bull';
import { QUEUE_NAMES } from '../config/redis.config';
import { BaseProcessor, JobResult, JobStatus } from './base.processor';
import { ScannerService, ScanResult, HubSpotContact } from '../campaigns/services/scanner.service';
import { DormancyRulesService } from '../campaigns/services/dormancy-rules.service';
import { CampaignService, CampaignCreationResult } from '../campaigns/services/campaign.service';

/**
 * Job data for dormancy scan
 */
export interface DormancyScanJobData {
  accountId: string;
  portalId: number;
  ruleId?: string;
  fullScan?: boolean;
  forceRefresh?: boolean;
  incrementalSince?: string;
}

/**
 * Account info for scheduled scans
 */
export interface AccountInfo {
  id: string;
  portalId: number;
}

/**
 * Result of a scheduled scan
 */
export interface ScheduledScanResult {
  accountsProcessed: number;
  accountsFailed: number;
  totalContactsFound: number;
  results: ScanResult[];
  completedAt: Date;
}

/**
 * Scan status for an account
 */
export interface ScanStatus {
  lastScanAt: Date | null;
  status: 'idle' | 'running' | 'completed' | 'failed';
  contactsFound: number;
  lastError?: string;
}

// In-memory scan status tracking (would be moved to database in production)
const scanStatusMap = new Map<string, ScanStatus>();

/**
 * Processor for dormancy scanning jobs
 * Scans contacts for dormancy based on configured rules
 */
@Processor(QUEUE_NAMES.DORMANCY_SCAN)
@Injectable()
export class DormancyScanProcessor extends BaseProcessor<DormancyScanJobData> {
  readonly queueName = QUEUE_NAMES.DORMANCY_SCAN;
  protected readonly logger = new Logger(DormancyScanProcessor.name);

  constructor(
    private readonly scannerService: ScannerService,
    private readonly rulesService: DormancyRulesService,
    private readonly campaignService: CampaignService,
  ) {
    super();
  }

  @Process()
  async processJob(job: Job<DormancyScanJobData>): Promise<JobResult> {
    const { accountId, portalId, ruleId, forceRefresh, incrementalSince } = job.data;

    // Validate required fields
    if (!accountId || !portalId) {
      throw new Error('Invalid job data: accountId and portalId are required');
    }

    this.logger.log(`Starting dormancy scan for account ${accountId}`);
    this.updateScanStatus(accountId, 'running');

    try {
      const options = {
        forceRefresh: forceRefresh || false,
        incrementalSince,
      };

      let scanResults: ScanResult[];
      let totalFound: number;
      let campaignResults: CampaignCreationResult[] = [];

      if (ruleId) {
        // Scan for a specific rule
        const result = await this.scannerService.scanForRule(
          accountId,
          portalId,
          ruleId,
          options,
        );
        scanResults = [result];
        totalFound = result.totalFound;
      } else {
        // Scan all active rules
        scanResults = await this.scannerService.scanAllRules(
          accountId,
          portalId,
          options,
        );
        totalFound = scanResults.reduce((sum, r) => sum + r.totalFound, 0);
      }

      await job.progress(50);

      // Create campaigns from scan results
      if (totalFound > 0) {
        campaignResults = await this.campaignService.createCampaignsFromMultipleScans(
          accountId,
          scanResults,
        );

        const campaignsCreated = campaignResults.filter((r) => r.campaign !== null).length;
        const totalOutreach = campaignResults.reduce(
          (sum, r) => sum + r.outreachRecordsCreated,
          0,
        );

        this.logger.log(
          `Created ${campaignsCreated} campaigns with ${totalOutreach} outreach records`,
        );
      }

      this.updateScanStatus(accountId, 'completed', totalFound);
      await job.progress(100);

      return {
        status: JobStatus.COMPLETED,
        message: `Dormancy scan completed for account ${accountId}`,
        data: {
          accountId,
          ruleId,
          totalFound,
          scanResults,
          campaignResults,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.updateScanStatus(accountId, 'failed', 0, errorMessage);
      this.logger.error(`Dormancy scan failed for account ${accountId}: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Process scheduled scan for multiple accounts
   * Used by cron jobs for daily scanning
   */
  async processScheduledScan(accounts: AccountInfo[]): Promise<ScheduledScanResult> {
    this.logger.log(`Starting scheduled scan for ${accounts.length} accounts`);

    const result: ScheduledScanResult = {
      accountsProcessed: 0,
      accountsFailed: 0,
      totalContactsFound: 0,
      results: [],
      completedAt: new Date(),
    };

    if (accounts.length === 0) {
      return result;
    }

    for (const account of accounts) {
      result.accountsProcessed++;

      try {
        const scanResults = await this.scannerService.scanAllRules(
          account.id,
          account.portalId,
          { forceRefresh: true },
        );

        result.results.push(...scanResults);
        const contactsFound = scanResults.reduce((sum, r) => sum + r.totalFound, 0);
        result.totalContactsFound += contactsFound;

        // Create campaigns from scan results
        if (contactsFound > 0) {
          const campaignResults = await this.campaignService.createCampaignsFromMultipleScans(
            account.id,
            scanResults,
          );

          const campaignsCreated = campaignResults.filter((r) => r.campaign !== null).length;
          this.logger.log(
            `Created ${campaignsCreated} campaigns for account ${account.id}`,
          );
        }

        this.logger.log(
          `Completed scan for account ${account.id}: ${scanResults.length} rules processed`,
        );
      } catch (error) {
        result.accountsFailed++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(
          `Failed to scan account ${account.id}: ${errorMessage}. Continuing with next account.`,
        );
      }
    }

    result.completedAt = new Date();
    this.logger.log(
      `Scheduled scan completed: ${result.accountsProcessed} accounts, ${result.totalContactsFound} contacts found, ${result.accountsFailed} failures`,
    );

    return result;
  }

  /**
   * Batch contacts into groups for processing
   * Useful for creating campaign records in batches
   */
  batchContacts<T>(contacts: T[], batchSize: number): T[][] {
    if (contacts.length === 0) {
      return [];
    }

    const batches: T[][] = [];
    for (let i = 0; i < contacts.length; i += batchSize) {
      batches.push(contacts.slice(i, i + batchSize));
    }

    return batches;
  }

  /**
   * Get the scan status for an account
   */
  async getScanStatus(accountId: string): Promise<ScanStatus> {
    const status = scanStatusMap.get(accountId);

    if (!status) {
      return {
        lastScanAt: null,
        status: 'idle',
        contactsFound: 0,
      };
    }

    return status;
  }

  /**
   * Update the scan status for an account
   */
  private updateScanStatus(
    accountId: string,
    status: ScanStatus['status'],
    contactsFound: number = 0,
    lastError?: string,
  ): void {
    scanStatusMap.set(accountId, {
      lastScanAt: status === 'completed' || status === 'failed' ? new Date() : null,
      status,
      contactsFound,
      lastError,
    });
  }

  @OnQueueCompleted()
  override onCompleted(job: Job<DormancyScanJobData>, result: any): void {
    const contactsFound = Array.isArray(result)
      ? result.reduce((sum: number, r: ScanResult) => sum + r.totalFound, 0)
      : result?.totalFound || 0;

    this.logger.log(
      `Dormancy scan job ${job.id} completed: ${contactsFound} dormant contacts found`,
    );
  }

  @OnQueueFailed()
  override onFailed(job: Job<DormancyScanJobData>, error: Error): void {
    this.logger.error(
      `Dormancy scan job ${job.id} failed for account ${job.data.accountId}: ${error.message}`,
    );
  }
}
