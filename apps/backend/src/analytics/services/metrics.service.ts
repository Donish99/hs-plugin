import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OutreachRecord } from '../../entities/outreach-record.entity';
import { Campaign } from '../../entities/campaign.entity';
import { Response } from '../../entities/response.entity';

/**
 * Campaign metrics interface
 */
export interface CampaignMetrics {
  campaignId: string;
  totalContacts: number;
  sent: number;
  delivered: number;
  bounced: number;
  opened: number;
  clicked: number;
  replied: number;
  positiveResponses: number;
  meetingsBooked: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  deliveryRate: number;
  bounceRate: number;
}

/**
 * Engagement metrics interface
 */
export interface EngagementMetrics {
  sent: number;
  delivered: number;
  bounced: number;
  opened: number;
  clicked: number;
  replied: number;
  positiveResponses: number;
  meetingsScheduled: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  deliveryRate: number;
  bounceRate: number;
}

/**
 * Time series data point
 */
export interface TimeSeriesDataPoint {
  date: string;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
}

/**
 * Trend analysis result
 */
export interface TrendAnalysis {
  sentChange: number;
  deliveredChange: number;
  openRateChange: number;
  clickRateChange: number;
  replyRateChange: number;
  period: string;
}

/**
 * Campaign comparison result
 */
export interface CampaignComparison {
  campaignId: string;
  totalContacts: number;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
}

/**
 * Industry benchmarks
 */
export interface IndustryBenchmarks {
  openRate: number;
  clickRate: number;
  replyRate: number;
  bounceRate: number;
}

/**
 * Benchmark comparison metric
 */
export interface BenchmarkMetric {
  actual: number;
  benchmark: number;
  difference: number;
  status: 'above' | 'below' | 'at';
}

/**
 * Benchmark comparison result
 */
export interface BenchmarkComparison {
  openRate: BenchmarkMetric;
  clickRate: BenchmarkMetric;
  replyRate: BenchmarkMetric;
  bounceRate: BenchmarkMetric;
}

/**
 * Date range filter
 */
export interface DateRangeFilter {
  startDate?: Date;
  endDate?: Date;
}

/**
 * Raw metrics data from database query
 */
interface RawMetricsData {
  total?: string | null;
  sent?: string | null;
  delivered?: string | null;
  bounced?: string | null;
  opened?: string | null;
  clicked?: string | null;
  replied?: string | null;
}

@Injectable()
export class MetricsService {
  // Industry benchmarks for B2B email campaigns
  private readonly INDUSTRY_BENCHMARKS: IndustryBenchmarks = {
    openRate: 21.5,
    clickRate: 2.5,
    replyRate: 1.5,
    bounceRate: 3.0,
  };

  constructor(
    @InjectRepository(OutreachRecord)
    private readonly outreachRepository: Repository<OutreachRecord>,
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,
    @InjectRepository(Response)
    private readonly responseRepository: Repository<Response>,
  ) {}

  /**
   * Get metrics for a specific campaign
   */
  async getCampaignMetrics(campaignId: string): Promise<CampaignMetrics> {
    const rawMetrics = await this.outreachRepository
      .createQueryBuilder('outreach')
      .select('COUNT(*)', 'total')
      .addSelect(`COUNT(*) FILTER (WHERE outreach.status != 'pending')`, 'sent')
      .addSelect(
        `COUNT(*) FILTER (WHERE outreach.status IN ('delivered', 'opened', 'clicked', 'replied'))`,
        'delivered',
      )
      .addSelect(`COUNT(*) FILTER (WHERE outreach.status = 'bounced')`, 'bounced')
      .addSelect(`COUNT(*) FILTER (WHERE outreach.opened_at IS NOT NULL)`, 'opened')
      .addSelect(`COUNT(*) FILTER (WHERE outreach.clicked_at IS NOT NULL)`, 'clicked')
      .addSelect(`COUNT(*) FILTER (WHERE outreach.replied_at IS NOT NULL)`, 'replied')
      .where('outreach.campaign_id = :campaignId', { campaignId })
      .getRawOne();

    const responseMetrics = await this.getResponseMetrics(campaignId);

    return this.buildCampaignMetrics(campaignId, rawMetrics, responseMetrics);
  }

  /**
   * Get engagement metrics for an account
   */
  async getEngagementMetrics(
    accountId: string,
    dateRange?: DateRangeFilter,
  ): Promise<EngagementMetrics> {
    const qb = this.outreachRepository
      .createQueryBuilder('outreach')
      .select(`COUNT(*) FILTER (WHERE outreach.status != 'pending')`, 'sent')
      .addSelect(
        `COUNT(*) FILTER (WHERE outreach.status IN ('delivered', 'opened', 'clicked', 'replied'))`,
        'delivered',
      )
      .addSelect(`COUNT(*) FILTER (WHERE outreach.status = 'bounced')`, 'bounced')
      .addSelect(`COUNT(*) FILTER (WHERE outreach.opened_at IS NOT NULL)`, 'opened')
      .addSelect(`COUNT(*) FILTER (WHERE outreach.clicked_at IS NOT NULL)`, 'clicked')
      .addSelect(`COUNT(*) FILTER (WHERE outreach.replied_at IS NOT NULL)`, 'replied')
      .where('outreach.account_id = :accountId', { accountId });

    if (dateRange?.startDate) {
      qb.andWhere('outreach.created_at >= :startDate', {
        startDate: dateRange.startDate,
      });
    }

    if (dateRange?.endDate) {
      qb.andWhere('outreach.created_at <= :endDate', {
        endDate: dateRange.endDate,
      });
    }

    const rawMetrics = await qb.getRawOne();

    const responseMetrics = await this.getAccountResponseMetrics(accountId, dateRange);

    return this.buildEngagementMetrics(rawMetrics, responseMetrics);
  }

  /**
   * Get time series data for analytics charts
   */
  async getTimeSeriesData(
    accountId: string,
    granularity: 'daily' | 'weekly' | 'monthly' = 'daily',
    dateRange?: DateRangeFilter,
  ): Promise<TimeSeriesDataPoint[]> {
    const dateFormat = this.getDateFormat(granularity);

    const qb = this.outreachRepository
      .createQueryBuilder('outreach')
      .select(`TO_CHAR(outreach.sent_at, '${dateFormat}')`, 'date')
      .addSelect(`COUNT(*) FILTER (WHERE outreach.status != 'pending')`, 'sent')
      .addSelect(`COUNT(*) FILTER (WHERE outreach.opened_at IS NOT NULL)`, 'opened')
      .addSelect(`COUNT(*) FILTER (WHERE outreach.clicked_at IS NOT NULL)`, 'clicked')
      .addSelect(`COUNT(*) FILTER (WHERE outreach.replied_at IS NOT NULL)`, 'replied')
      .where('outreach.account_id = :accountId', { accountId })
      .andWhere('outreach.sent_at IS NOT NULL');

    if (dateRange?.startDate) {
      qb.andWhere('outreach.sent_at >= :startDate', {
        startDate: dateRange.startDate,
      });
    }

    if (dateRange?.endDate) {
      qb.andWhere('outreach.sent_at <= :endDate', {
        endDate: dateRange.endDate,
      });
    }

    qb.groupBy('date').orderBy('date', 'ASC');

    const rawData = await qb.getRawMany();

    return rawData.map((row) => ({
      date: row.date,
      sent: parseInt(row.sent, 10) || 0,
      opened: parseInt(row.opened, 10) || 0,
      clicked: parseInt(row.clicked, 10) || 0,
      replied: parseInt(row.replied, 10) || 0,
    }));
  }

  /**
   * Get trend analysis comparing current period to previous period
   */
  async getTrendAnalysis(accountId: string, periodDays: number = 7): Promise<TrendAnalysis> {
    const now = new Date();
    const currentPeriodStart = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);
    const previousPeriodStart = new Date(
      currentPeriodStart.getTime() - periodDays * 24 * 60 * 60 * 1000,
    );

    const currentMetrics = await this.getEngagementMetrics(accountId, {
      startDate: currentPeriodStart,
      endDate: now,
    });

    const previousMetrics = await this.getEngagementMetrics(accountId, {
      startDate: previousPeriodStart,
      endDate: currentPeriodStart,
    });

    return {
      sentChange: this.calculatePercentageChange(previousMetrics.sent, currentMetrics.sent),
      deliveredChange: this.calculatePercentageChange(
        previousMetrics.delivered,
        currentMetrics.delivered,
      ),
      openRateChange: currentMetrics.openRate - previousMetrics.openRate,
      clickRateChange: currentMetrics.clickRate - previousMetrics.clickRate,
      replyRateChange: currentMetrics.replyRate - previousMetrics.replyRate,
      period: `${periodDays} days`,
    };
  }

  /**
   * Compare metrics between multiple campaigns
   */
  async compareCampaigns(campaignIds: string[]): Promise<CampaignComparison[]> {
    if (campaignIds.length === 0) {
      return [];
    }

    const rawData = await this.outreachRepository
      .createQueryBuilder('outreach')
      .select('outreach.campaign_id', 'campaign_id')
      .addSelect('COUNT(*)', 'total')
      .addSelect(`COUNT(*) FILTER (WHERE outreach.status != 'pending')`, 'sent')
      .addSelect(`COUNT(*) FILTER (WHERE outreach.opened_at IS NOT NULL)`, 'opened')
      .addSelect(`COUNT(*) FILTER (WHERE outreach.clicked_at IS NOT NULL)`, 'clicked')
      .addSelect(`COUNT(*) FILTER (WHERE outreach.replied_at IS NOT NULL)`, 'replied')
      .where('outreach.campaign_id IN (:...campaignIds)', { campaignIds })
      .groupBy('outreach.campaign_id')
      .getRawMany();

    return rawData.map((row) => {
      const sent = parseInt(row.sent, 10) || 0;
      const opened = parseInt(row.opened, 10) || 0;
      const clicked = parseInt(row.clicked, 10) || 0;
      const replied = parseInt(row.replied, 10) || 0;

      return {
        campaignId: row.campaign_id,
        totalContacts: parseInt(row.total, 10) || 0,
        sent,
        opened,
        clicked,
        replied,
        openRate: this.calculateRate(opened, sent),
        clickRate: this.calculateRate(clicked, sent),
        replyRate: this.calculateRate(replied, sent),
      };
    });
  }

  /**
   * Get industry benchmark data
   */
  async getIndustryBenchmarks(): Promise<IndustryBenchmarks> {
    return this.INDUSTRY_BENCHMARKS;
  }

  /**
   * Get benchmark comparison for an account
   */
  async getBenchmarkComparison(accountId: string): Promise<BenchmarkComparison> {
    const metrics = await this.getEngagementMetrics(accountId);
    const benchmarks = this.INDUSTRY_BENCHMARKS;

    return {
      openRate: this.createBenchmarkMetric(metrics.openRate, benchmarks.openRate),
      clickRate: this.createBenchmarkMetric(metrics.clickRate, benchmarks.clickRate),
      replyRate: this.createBenchmarkMetric(metrics.replyRate, benchmarks.replyRate),
      bounceRate: this.createBenchmarkMetric(metrics.bounceRate, benchmarks.bounceRate, true),
    };
  }

  /**
   * Get response metrics for a campaign
   */
  private async getResponseMetrics(
    campaignId: string,
  ): Promise<{ positiveCount: number; meetingsCount: number }> {
    const result = await this.responseRepository
      .createQueryBuilder('response')
      .select(`COUNT(*) FILTER (WHERE response.sentiment = 'positive')`, 'positive_count')
      .addSelect(
        `COUNT(*) FILTER (WHERE response.response_type = 'meeting_booked')`,
        'meetings_count',
      )
      .innerJoin('response.outreach', 'outreach')
      .where('outreach.campaign_id = :campaignId', { campaignId })
      .getRawOne();

    return {
      positiveCount: parseInt(result?.positive_count, 10) || 0,
      meetingsCount: parseInt(result?.meetings_count, 10) || 0,
    };
  }

  /**
   * Get response metrics for an account
   */
  private async getAccountResponseMetrics(
    accountId: string,
    dateRange?: DateRangeFilter,
  ): Promise<{ positiveCount: number; meetingsCount: number }> {
    const qb = this.responseRepository
      .createQueryBuilder('response')
      .select(`COUNT(*) FILTER (WHERE response.sentiment = 'positive')`, 'positive_count')
      .addSelect(
        `COUNT(*) FILTER (WHERE response.response_type = 'meeting_booked')`,
        'meetings_count',
      )
      .innerJoin('response.outreach', 'outreach')
      .where('outreach.account_id = :accountId', { accountId });

    if (dateRange?.startDate) {
      qb.andWhere('response.created_at >= :startDate', {
        startDate: dateRange.startDate,
      });
    }

    if (dateRange?.endDate) {
      qb.andWhere('response.created_at <= :endDate', {
        endDate: dateRange.endDate,
      });
    }

    const result = await qb.getRawOne();

    return {
      positiveCount: parseInt(result?.positive_count, 10) || 0,
      meetingsCount: parseInt(result?.meetings_count, 10) || 0,
    };
  }

  /**
   * Build campaign metrics from raw data
   */
  private buildCampaignMetrics(
    campaignId: string,
    rawMetrics: RawMetricsData | undefined,
    responseMetrics: { positiveCount: number; meetingsCount: number },
  ): CampaignMetrics {
    const total = parseInt(rawMetrics?.total ?? '0', 10) || 0;
    const sent = parseInt(rawMetrics?.sent ?? '0', 10) || 0;
    const delivered = parseInt(rawMetrics?.delivered ?? '0', 10) || 0;
    const bounced = parseInt(rawMetrics?.bounced ?? '0', 10) || 0;
    const opened = parseInt(rawMetrics?.opened ?? '0', 10) || 0;
    const clicked = parseInt(rawMetrics?.clicked ?? '0', 10) || 0;
    const replied = parseInt(rawMetrics?.replied ?? '0', 10) || 0;

    return {
      campaignId,
      totalContacts: total,
      sent,
      delivered,
      bounced,
      opened,
      clicked,
      replied,
      positiveResponses: responseMetrics.positiveCount,
      meetingsBooked: responseMetrics.meetingsCount,
      openRate: this.calculateRate(opened, sent),
      clickRate: this.calculateRate(clicked, sent),
      replyRate: this.calculateRate(replied, sent),
      deliveryRate: this.calculateRate(delivered, sent),
      bounceRate: this.calculateRate(bounced, sent),
    };
  }

  /**
   * Build engagement metrics from raw data
   */
  private buildEngagementMetrics(
    rawMetrics: RawMetricsData | undefined,
    responseMetrics: { positiveCount: number; meetingsCount: number },
  ): EngagementMetrics {
    const sent = parseInt(rawMetrics?.sent ?? '0', 10) || 0;
    const delivered = parseInt(rawMetrics?.delivered ?? '0', 10) || 0;
    const bounced = parseInt(rawMetrics?.bounced ?? '0', 10) || 0;
    const opened = parseInt(rawMetrics?.opened ?? '0', 10) || 0;
    const clicked = parseInt(rawMetrics?.clicked ?? '0', 10) || 0;
    const replied = parseInt(rawMetrics?.replied ?? '0', 10) || 0;

    return {
      sent,
      delivered,
      bounced,
      opened,
      clicked,
      replied,
      positiveResponses: responseMetrics.positiveCount,
      meetingsScheduled: responseMetrics.meetingsCount,
      openRate: this.calculateRate(opened, sent),
      clickRate: this.calculateRate(clicked, sent),
      replyRate: this.calculateRate(replied, sent),
      deliveryRate: this.calculateRate(delivered, sent),
      bounceRate: this.calculateRate(bounced, sent),
    };
  }

  /**
   * Calculate rate as a percentage, handling division by zero
   */
  private calculateRate(numerator: number, denominator: number): number {
    if (denominator === 0) {
      return 0;
    }
    return Math.round((numerator / denominator) * 10000) / 100;
  }

  /**
   * Calculate percentage change between two values
   */
  private calculatePercentageChange(previous: number, current: number): number {
    if (previous === 0) {
      return current > 0 ? 100 : 0;
    }
    return Math.round(((current - previous) / previous) * 10000) / 100;
  }

  /**
   * Get date format string for time series grouping
   */
  private getDateFormat(granularity: 'daily' | 'weekly' | 'monthly'): string {
    switch (granularity) {
      case 'weekly':
        return 'YYYY-MM-DD'; // Start of week
      case 'monthly':
        return 'YYYY-MM-01';
      case 'daily':
      default:
        return 'YYYY-MM-DD';
    }
  }

  /**
   * Create a benchmark comparison metric
   */
  private createBenchmarkMetric(
    actual: number,
    benchmark: number,
    lowerIsBetter: boolean = false,
  ): BenchmarkMetric {
    const difference = actual - benchmark;
    let status: 'above' | 'below' | 'at';

    if (Math.abs(difference) < 0.5) {
      status = 'at';
    } else if (lowerIsBetter) {
      status = difference < 0 ? 'above' : 'below';
    } else {
      status = difference > 0 ? 'above' : 'below';
    }

    return {
      actual,
      benchmark,
      difference: Math.round(difference * 100) / 100,
      status,
    };
  }
}
