import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QUEUE_NAMES } from '../config/redis.config';
import { DormancyScanProcessor, DormancyScanJobData, AccountInfo } from './dormancy-scan.processor';
import { HubspotAccount } from '../entities/hubspot-account.entity';

export interface TriggerScanOptions {
  ruleId?: string;
  forceRefresh?: boolean;
  incrementalSince?: string;
}

export interface SchedulerStatus {
  isRunning: boolean;
  pendingJobs: number;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
}

@Injectable()
export class DormancyScanScheduler {
  private readonly logger = new Logger(DormancyScanScheduler.name);
  private isRunning = true;
  private lastRunAt: Date | null = null;

  constructor(
    private readonly scanProcessor: DormancyScanProcessor,
    @InjectQueue(QUEUE_NAMES.DORMANCY_SCAN)
    private readonly scanQueue: Queue<DormancyScanJobData>,
    @InjectRepository(HubspotAccount)
    private readonly accountRepository: Repository<HubspotAccount>,
  ) {}

  /**
   * Daily cron job to scan all active accounts for dormant contacts
   * Runs at 2:00 AM every day
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async handleDailyScan(): Promise<void> {
    if (!this.isRunning) {
      this.logger.log('Scheduler is paused, skipping daily scan');
      return;
    }

    this.logger.log('Starting daily dormancy scan');

    try {
      // Get all active accounts
      const accounts = await this.accountRepository.find({
        where: { isActive: true },
      });

      if (accounts.length === 0) {
        this.logger.log('No active accounts found, skipping scan');
        return;
      }

      // Convert to AccountInfo format
      const accountInfos: AccountInfo[] = accounts.map((account) => ({
        id: account.id,
        portalId: account.portalId,
      }));

      // Process all accounts
      const result = await this.scanProcessor.processScheduledScan(accountInfos);

      this.lastRunAt = new Date();
      this.logger.log(
        `Daily scan completed: ${result.accountsProcessed} accounts processed, ` +
          `${result.totalContactsFound} dormant contacts found, ` +
          `${result.accountsFailed} failures`,
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Daily scan failed: ${errorMessage}`);
    }
  }

  /**
   * Manually trigger a scan for a specific account
   */
  async triggerScanForAccount(
    accountId: string,
    options: TriggerScanOptions = {},
  ): Promise<void> {
    const account = await this.accountRepository.findOne({
      where: { id: accountId },
    });

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    const jobData: DormancyScanJobData = {
      accountId: account.id,
      portalId: account.portalId,
      ruleId: options.ruleId,
      forceRefresh: options.forceRefresh,
      incrementalSince: options.incrementalSince,
    };

    await this.scanQueue.add(jobData, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    });

    this.logger.log(
      `Triggered manual scan for account ${accountId}` +
        (options.ruleId ? ` (rule: ${options.ruleId})` : ''),
    );
  }

  /**
   * Get the current status of the scheduler
   */
  async getSchedulerStatus(): Promise<SchedulerStatus> {
    const pendingJobs = await this.scanQueue.getJobs(['waiting', 'active', 'delayed']);

    // Calculate next run time (2:00 AM next day)
    const now = new Date();
    const nextRun = new Date(now);
    nextRun.setHours(2, 0, 0, 0);
    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 1);
    }

    return {
      isRunning: this.isRunning,
      pendingJobs: pendingJobs.length,
      lastRunAt: this.lastRunAt,
      nextRunAt: this.isRunning ? nextRun : null,
    };
  }

  /**
   * Pause the scheduler
   */
  async pauseScheduler(): Promise<void> {
    this.isRunning = false;
    this.logger.log('Scheduler paused');
  }

  /**
   * Resume the scheduler
   */
  async resumeScheduler(): Promise<void> {
    this.isRunning = true;
    this.logger.log('Scheduler resumed');
  }
}
