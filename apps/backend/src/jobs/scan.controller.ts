import { Controller, Post, Get, Body, Logger } from '@nestjs/common';
import { AccountId } from '../common/decorators/account.decorator';
import { DormancyScanScheduler, TriggerScanOptions, SchedulerStatus } from './dormancy-scan.scheduler';

/**
 * DTO for triggering a scan
 */
interface TriggerScanDto {
  ruleId?: string;
  forceRefresh?: boolean;
  incrementalSince?: string;
}

/**
 * Response for trigger scan
 */
interface TriggerScanResponse {
  success: boolean;
  message: string;
  accountId: string;
  ruleId?: string;
}

/**
 * Response for scheduler control operations
 */
interface SchedulerControlResponse {
  success: boolean;
  message: string;
}

/**
 * Controller for managing dormancy scans
 * Exposes REST endpoints to trigger and manage scans
 */
@Controller('api/accounts/:accountId/scan')
export class ScanController {
  private readonly logger = new Logger(ScanController.name);

  constructor(private readonly scheduler: DormancyScanScheduler) {}

  /**
   * POST /api/accounts/:accountId/scan/trigger
   * Manually trigger a dormancy scan for the account
   */
  @Post('trigger')
  async triggerScan(
    @AccountId() accountId: string,
    @Body() dto: TriggerScanDto,
  ): Promise<TriggerScanResponse> {
    const options: TriggerScanOptions = {
      ruleId: dto.ruleId,
      forceRefresh: dto.forceRefresh,
      incrementalSince: dto.incrementalSince,
    };

    this.logger.log(
      `Manual scan triggered for account ${accountId}` +
        (dto.ruleId ? ` (rule: ${dto.ruleId})` : ''),
    );

    await this.scheduler.triggerScanForAccount(accountId, options);

    const response: TriggerScanResponse = {
      success: true,
      message: 'Scan triggered successfully',
      accountId,
    };

    if (dto.ruleId) {
      response.ruleId = dto.ruleId;
    }

    return response;
  }

  /**
   * GET /api/accounts/:accountId/scan/status
   * Get the current status of the scan scheduler
   */
  @Get('status')
  async getStatus(): Promise<SchedulerStatus> {
    return this.scheduler.getSchedulerStatus();
  }

  /**
   * POST /api/accounts/:accountId/scan/pause
   * Pause the scheduler (admin only in production)
   */
  @Post('pause')
  async pauseScheduler(): Promise<SchedulerControlResponse> {
    await this.scheduler.pauseScheduler();
    return {
      success: true,
      message: 'Scheduler paused',
    };
  }

  /**
   * POST /api/accounts/:accountId/scan/resume
   * Resume the scheduler (admin only in production)
   */
  @Post('resume')
  async resumeScheduler(): Promise<SchedulerControlResponse> {
    await this.scheduler.resumeScheduler();
    return {
      success: true,
      message: 'Scheduler resumed',
    };
  }
}
