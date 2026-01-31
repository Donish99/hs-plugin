import {
  Controller,
  Get,
  Param,
  Query,
  Header,
  BadRequestException,
} from '@nestjs/common';
import {
  MetricsService,
  CampaignMetrics,
  EngagementMetrics,
  TimeSeriesDataPoint,
  TrendAnalysis,
  CampaignComparison,
  IndustryBenchmarks,
  BenchmarkComparison,
} from '../services/metrics.service';
import {
  RoiService,
  ROIMetrics,
  CostBreakdown,
  DealAttribution,
  RevenueByPeriod,
  DealStageProgression,
} from '../services/roi.service';
import {
  AbTestService,
  VariantPerformance,
  WinnerRecommendation,
  SubjectLinePerformance,
  SendTimePerformance,
  TonePerformance,
} from '../services/ab-test.service';
import {
  ActivityLogService,
  ActivityLogResult,
  ActivityEvent,
} from '../services/activity-log.service';

/**
 * Dashboard overview response
 */
interface DashboardOverview {
  engagement: EngagementMetrics;
  roi: ROIMetrics;
  trend: TrendAnalysis;
}

/**
 * A/B test results response
 */
interface AbTestResults {
  variants: VariantPerformance[];
  recommendation: WinnerRecommendation;
}

/**
 * Best performers response
 */
interface BestPerformers {
  subjectLines: SubjectLinePerformance[];
  sendTimes: SendTimePerformance[];
  tones: TonePerformance[];
}

/**
 * Benchmarks response
 */
interface BenchmarksResponse {
  industry: IndustryBenchmarks;
  comparison: BenchmarkComparison;
}

@Controller('api/v1/accounts/:accountId/analytics')
export class DashboardController {
  constructor(
    private readonly metricsService: MetricsService,
    private readonly roiService: RoiService,
    private readonly abTestService: AbTestService,
    private readonly activityLogService: ActivityLogService,
  ) {}

  /**
   * Get dashboard overview with all key metrics
   */
  @Get('overview')
  async getDashboardOverview(
    @Param('accountId') accountId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<DashboardOverview> {
    const dateRange = this.parseDateRange(startDate, endDate);

    const [engagement, roi, trend] = await Promise.all([
      this.metricsService.getEngagementMetrics(accountId, dateRange),
      this.roiService.getROIMetrics(accountId, dateRange),
      this.metricsService.getTrendAnalysis(accountId, 7),
    ]);

    return { engagement, roi, trend };
  }

  /**
   * Get metrics for a specific campaign
   */
  @Get('campaigns/:campaignId')
  async getCampaignMetrics(
    @Param('accountId') _accountId: string,
    @Param('campaignId') campaignId: string,
  ): Promise<CampaignMetrics> {
    return this.metricsService.getCampaignMetrics(campaignId);
  }

  /**
   * Get time series data for charts
   */
  @Get('time-series')
  async getTimeSeriesData(
    @Param('accountId') accountId: string,
    @Query('granularity') granularity: 'daily' | 'weekly' | 'monthly' = 'daily',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<TimeSeriesDataPoint[]> {
    const dateRange = this.parseDateRange(startDate, endDate);
    return this.metricsService.getTimeSeriesData(accountId, granularity, dateRange);
  }

  /**
   * Compare metrics across multiple campaigns
   */
  @Get('campaigns/compare')
  async compareCampaigns(
    @Param('accountId') _accountId: string,
    @Query('campaignIds') campaignIds: string[],
  ): Promise<CampaignComparison[]> {
    if (!campaignIds || campaignIds.length === 0) {
      throw new BadRequestException('At least one campaign ID is required');
    }
    return this.metricsService.compareCampaigns(campaignIds);
  }

  /**
   * Get ROI metrics
   */
  @Get('roi')
  async getRoiMetrics(
    @Param('accountId') accountId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<ROIMetrics> {
    const dateRange = this.parseDateRange(startDate, endDate);
    return this.roiService.getROIMetrics(accountId, dateRange);
  }

  /**
   * Get cost breakdown
   */
  @Get('roi/costs')
  async getCostBreakdown(
    @Param('accountId') accountId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<CostBreakdown> {
    const dateRange = this.parseDateRange(startDate, endDate);
    return this.roiService.getCostBreakdown(accountId, dateRange);
  }

  /**
   * Get deal attribution
   */
  @Get('roi/deals')
  async getDealAttribution(
    @Param('accountId') accountId: string,
    @Query('campaignId') campaignId?: string,
  ): Promise<DealAttribution[]> {
    return this.roiService.getDealAttribution(accountId, campaignId);
  }

  /**
   * Get revenue by period
   */
  @Get('roi/revenue')
  async getRevenueByPeriod(
    @Param('accountId') accountId: string,
    @Query('granularity') granularity: 'daily' | 'weekly' | 'monthly' = 'monthly',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<RevenueByPeriod[]> {
    const dateRange = this.parseDateRange(startDate, endDate);
    return this.roiService.getRevenueAttributedByPeriod(accountId, granularity, dateRange);
  }

  /**
   * Get deal stage progression
   */
  @Get('roi/progression')
  async getDealProgression(
    @Param('accountId') accountId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<DealStageProgression> {
    const dateRange = this.parseDateRange(startDate, endDate);
    return this.roiService.getDealStageProgression(accountId, dateRange);
  }

  /**
   * Get A/B test results for a variant group
   */
  @Get('ab-tests/:variantGroupId')
  async getAbTestResults(
    @Param('accountId') _accountId: string,
    @Param('variantGroupId') variantGroupId: string,
  ): Promise<AbTestResults> {
    const [variants, recommendation] = await Promise.all([
      this.abTestService.getVariantPerformance(variantGroupId),
      this.abTestService.getWinnerRecommendation(variantGroupId),
    ]);

    return { variants, recommendation };
  }

  /**
   * Get best performing content
   */
  @Get('best-performers')
  async getBestPerformers(@Param('accountId') accountId: string): Promise<BestPerformers> {
    const [subjectLines, sendTimes, tones] = await Promise.all([
      this.abTestService.getBestSubjectLines(accountId, 10),
      this.abTestService.getBestSendTimes(accountId),
      this.abTestService.getTonePerformance(accountId),
    ]);

    return { subjectLines, sendTimes, tones };
  }

  /**
   * Get activity log
   */
  @Get('activity')
  async getActivityLog(
    @Param('accountId') accountId: string,
    @Query('page') page: number = 1,
    @Query('pageSize') pageSize: number = 20,
    @Query('eventType') eventType?: ActivityEvent,
    @Query('campaignId') campaignId?: string,
    @Query('contactEmail') contactEmail?: string,
    @Query('search') search?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<ActivityLogResult> {
    const dateRange = this.parseDateRange(startDate, endDate);

    return this.activityLogService.getActivityLog(accountId, {
      page,
      pageSize,
      eventType,
      campaignId,
      contactEmail,
      search,
      ...dateRange,
    });
  }

  /**
   * Export activity log
   */
  @Get('activity/export')
  @Header('Content-Type', 'text/csv')
  async exportActivityLog(
    @Param('accountId') accountId: string,
    @Query('format') format: 'csv' | 'json' = 'csv',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<string> {
    const dateRange = this.parseDateRange(startDate, endDate);
    return this.activityLogService.exportActivityLog(accountId, format, dateRange);
  }

  /**
   * Get industry benchmarks and comparison
   */
  @Get('benchmarks')
  async getBenchmarks(@Param('accountId') accountId: string): Promise<BenchmarksResponse> {
    const [industry, comparison] = await Promise.all([
      this.metricsService.getIndustryBenchmarks(),
      this.metricsService.getBenchmarkComparison(accountId),
    ]);

    return { industry, comparison };
  }

  /**
   * Parse date range from query parameters
   */
  private parseDateRange(
    startDate?: string,
    endDate?: string,
  ): { startDate?: Date; endDate?: Date } {
    const result: { startDate?: Date; endDate?: Date } = {};

    if (startDate) {
      result.startDate = new Date(startDate);
      if (isNaN(result.startDate.getTime())) {
        throw new BadRequestException('Invalid start date format');
      }
    }

    if (endDate) {
      result.endDate = new Date(endDate);
      if (isNaN(result.endDate.getTime())) {
        throw new BadRequestException('Invalid end date format');
      }
    }

    return result;
  }
}
