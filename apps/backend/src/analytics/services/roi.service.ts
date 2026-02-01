import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { OutreachRecord } from '../../entities/outreach-record.entity';
import { Campaign } from '../../entities/campaign.entity';
import { Response } from '../../entities/response.entity';
import { DateRangeFilter } from './metrics.service';

/**
 * ROI metrics interface
 */
export interface ROIMetrics {
  totalCost: number;
  dealsInfluenced: number;
  pipelineValue: number;
  closedWonValue: number;
  dealsAdvanced: number;
  dealsReopened: number;
  roi: number;
}

/**
 * Deal attribution interface
 */
export interface DealAttribution {
  hubspotDealId: string;
  contactName: string;
  companyName: string;
  campaignName: string;
  responseType: string;
  createdAt: Date;
}

/**
 * Cost breakdown interface
 */
export interface CostBreakdown {
  emailCost: number;
  smsCost: number;
  aiCost: number;
  totalCost: number;
}

/**
 * Revenue by period interface
 */
export interface RevenueByPeriod {
  period: string;
  revenue: number;
}

/**
 * Deal stage progression interface
 */
export interface DealStageProgression {
  reopened: number;
  qualified: number;
  proposal: number;
  negotiation: number;
  closedWon: number;
  closedLost: number;
}

/**
 * Raw usage data from database
 */
interface UsageData {
  total_emails: string | null;
  total_sms: string | null;
  total_prompt_tokens: string | null;
  total_completion_tokens: string | null;
  reactivated_count?: string | null;
}

/**
 * Raw deal data from database
 */
interface DealData {
  deals_influenced: string | null;
  pipeline_value: string | null;
  closed_won_value: string | null;
  deals_advanced: string | null;
  deals_reopened: string | null;
}

@Injectable()
export class RoiService {
  private readonly AI_COST_PER_1K_TOKENS: number;
  private readonly EMAIL_COST_PER_SEND: number;
  private readonly SMS_COST_PER_SEND: number;

  constructor(
    @InjectRepository(OutreachRecord)
    private readonly outreachRepository: Repository<OutreachRecord>,
    @InjectRepository(Campaign)
    private readonly _campaignRepository: Repository<Campaign>,
    @InjectRepository(Response)
    private readonly responseRepository: Repository<Response>,
    private readonly configService: ConfigService,
  ) {
    this.AI_COST_PER_1K_TOKENS = this.configService.get<number>('AI_COST_PER_1K_TOKENS', 0.03);
    this.EMAIL_COST_PER_SEND = this.configService.get<number>('EMAIL_COST_PER_SEND', 0.001);
    this.SMS_COST_PER_SEND = this.configService.get<number>('SMS_COST_PER_SEND', 0.05);
  }

  /**
   * Get ROI metrics for an account
   */
  async getROIMetrics(accountId: string, dateRange?: DateRangeFilter): Promise<ROIMetrics> {
    const costBreakdown = await this.getCostBreakdown(accountId, dateRange);
    const dealMetrics = await this.getDealMetrics(accountId, dateRange);

    const roi = this.calculateROI(costBreakdown.totalCost, dealMetrics.closedWonValue);

    return {
      totalCost: costBreakdown.totalCost,
      dealsInfluenced: dealMetrics.dealsInfluenced,
      pipelineValue: dealMetrics.pipelineValue,
      closedWonValue: dealMetrics.closedWonValue,
      dealsAdvanced: dealMetrics.dealsAdvanced,
      dealsReopened: dealMetrics.dealsReopened,
      roi,
    };
  }

  /**
   * Get deal attribution details
   */
  async getDealAttribution(accountId: string, campaignId?: string): Promise<DealAttribution[]> {
    const qb = this.responseRepository
      .createQueryBuilder('response')
      .select('outreach.hubspot_deal_id', 'hubspot_deal_id')
      .addSelect('outreach.contact_name', 'contact_name')
      .addSelect('outreach.company_name', 'company_name')
      .addSelect('campaign.name', 'campaign_name')
      .addSelect('response.response_type', 'response_type')
      .addSelect('response.created_at', 'created_at')
      .innerJoin('response.outreach', 'outreach')
      .leftJoin('outreach.campaign', 'campaign')
      .where('outreach.account_id = :accountId', { accountId })
      .andWhere('outreach.hubspot_deal_id IS NOT NULL');

    if (campaignId) {
      qb.andWhere('outreach.campaign_id = :campaignId', { campaignId });
    }

    qb.groupBy('outreach.hubspot_deal_id')
      .addGroupBy('outreach.contact_name')
      .addGroupBy('outreach.company_name')
      .addGroupBy('campaign.name')
      .addGroupBy('response.response_type')
      .addGroupBy('response.created_at');

    const rawData = await qb.getRawMany();

    return rawData.map((row) => ({
      hubspotDealId: row.hubspot_deal_id,
      contactName: row.contact_name,
      companyName: row.company_name,
      campaignName: row.campaign_name,
      responseType: row.response_type,
      createdAt: row.created_at,
    }));
  }

  /**
   * Get cost breakdown for an account
   */
  async getCostBreakdown(accountId: string, dateRange?: DateRangeFilter): Promise<CostBreakdown> {
    const usageData = await this.getUsageData(accountId, dateRange);

    const totalEmails = parseInt(usageData.total_emails || '0', 10);
    const totalSms = parseInt(usageData.total_sms || '0', 10);
    const totalPromptTokens = parseInt(usageData.total_prompt_tokens || '0', 10);
    const totalCompletionTokens = parseInt(usageData.total_completion_tokens || '0', 10);

    const emailCost = totalEmails * this.EMAIL_COST_PER_SEND;
    const smsCost = totalSms * this.SMS_COST_PER_SEND;
    const aiCost =
      ((totalPromptTokens + totalCompletionTokens) / 1000) * this.AI_COST_PER_1K_TOKENS;

    return {
      emailCost: Math.round(emailCost * 100) / 100,
      smsCost: Math.round(smsCost * 100) / 100,
      aiCost: Math.round(aiCost * 100) / 100,
      totalCost: Math.round((emailCost + smsCost + aiCost) * 100) / 100,
    };
  }

  /**
   * Get cost per reactivation
   */
  async getCostPerReactivation(
    accountId: string,
    dateRange?: DateRangeFilter,
  ): Promise<number | null> {
    const qb = this.outreachRepository
      .createQueryBuilder('outreach')
      .select(`COUNT(*) FILTER (WHERE outreach.channel = 'email')`, 'total_emails')
      .addSelect(`COUNT(*) FILTER (WHERE outreach.channel = 'sms')`, 'total_sms')
      .addSelect('COALESCE(SUM(outreach.ai_prompt_tokens), 0)', 'total_prompt_tokens')
      .addSelect('COALESCE(SUM(outreach.ai_completion_tokens), 0)', 'total_completion_tokens')
      .addSelect(`COUNT(*) FILTER (WHERE outreach.replied_at IS NOT NULL)`, 'reactivated_count')
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

    const rawData = (await qb.getRawOne()) as UsageData;

    const reactivatedCount = parseInt(rawData?.reactivated_count || '0', 10);

    if (reactivatedCount === 0) {
      return null;
    }

    const totalEmails = parseInt(rawData?.total_emails || '0', 10);
    const totalSms = parseInt(rawData?.total_sms || '0', 10);
    const totalPromptTokens = parseInt(rawData?.total_prompt_tokens || '0', 10);
    const totalCompletionTokens = parseInt(rawData?.total_completion_tokens || '0', 10);

    const totalCost =
      totalEmails * this.EMAIL_COST_PER_SEND +
      totalSms * this.SMS_COST_PER_SEND +
      ((totalPromptTokens + totalCompletionTokens) / 1000) * this.AI_COST_PER_1K_TOKENS;

    return Math.round((totalCost / reactivatedCount) * 100) / 100;
  }

  /**
   * Get revenue attributed by time period
   */
  async getRevenueAttributedByPeriod(
    accountId: string,
    granularity: 'daily' | 'weekly' | 'monthly' = 'monthly',
    dateRange?: DateRangeFilter,
  ): Promise<RevenueByPeriod[]> {
    const dateFormat = this.getDateFormat(granularity);

    const qb = this.responseRepository
      .createQueryBuilder('response')
      .select(`TO_CHAR(response.created_at, '${dateFormat}')`, 'period')
      .addSelect('COALESCE(SUM(deal.amount), 0)', 'revenue')
      .innerJoin('response.outreach', 'outreach')
      .where('outreach.account_id = :accountId', { accountId })
      .andWhere('outreach.hubspot_deal_id IS NOT NULL');

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

    qb.groupBy('period').orderBy('period', 'ASC');

    const rawData = await qb.getRawMany();

    return rawData.map((row) => ({
      period: row.period,
      revenue: parseFloat(row.revenue) || 0,
    }));
  }

  /**
   * Get deal stage progression
   */
  async getDealStageProgression(
    accountId: string,
    dateRange?: DateRangeFilter,
  ): Promise<DealStageProgression> {
    const qb = this.responseRepository
      .createQueryBuilder('response')
      .select('response.action_taken', 'stage')
      .addSelect('COUNT(DISTINCT outreach.hubspot_deal_id)', 'count')
      .innerJoin('response.outreach', 'outreach')
      .where('outreach.account_id = :accountId', { accountId })
      .andWhere('outreach.hubspot_deal_id IS NOT NULL');

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

    qb.groupBy('response.action_taken');

    const rawData = await qb.getRawMany();

    const progression: DealStageProgression = {
      reopened: 0,
      qualified: 0,
      proposal: 0,
      negotiation: 0,
      closedWon: 0,
      closedLost: 0,
    };

    for (const row of rawData) {
      const stage = row.stage?.toLowerCase();
      const count = parseInt(row.count, 10) || 0;

      switch (stage) {
        case 'reopened':
          progression.reopened = count;
          break;
        case 'qualified':
          progression.qualified = count;
          break;
        case 'proposal':
          progression.proposal = count;
          break;
        case 'negotiation':
          progression.negotiation = count;
          break;
        case 'closed_won':
          progression.closedWon = count;
          break;
        case 'closed_lost':
          progression.closedLost = count;
          break;
      }
    }

    return progression;
  }

  /**
   * Get usage data for cost calculation
   */
  private async getUsageData(accountId: string, dateRange?: DateRangeFilter): Promise<UsageData> {
    const qb = this.outreachRepository
      .createQueryBuilder('outreach')
      .select(`COUNT(*) FILTER (WHERE outreach.channel = 'email')`, 'total_emails')
      .addSelect(`COUNT(*) FILTER (WHERE outreach.channel = 'sms')`, 'total_sms')
      .addSelect('COALESCE(SUM(outreach.ai_prompt_tokens), 0)', 'total_prompt_tokens')
      .addSelect('COALESCE(SUM(outreach.ai_completion_tokens), 0)', 'total_completion_tokens')
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

    const result = await qb.getRawOne();
    return result || {
      total_emails: '0',
      total_sms: '0',
      total_prompt_tokens: '0',
      total_completion_tokens: '0',
    };
  }

  /**
   * Get deal metrics
   */
  private async getDealMetrics(
    accountId: string,
    dateRange?: DateRangeFilter,
  ): Promise<{
    dealsInfluenced: number;
    pipelineValue: number;
    closedWonValue: number;
    dealsAdvanced: number;
    dealsReopened: number;
  }> {
    const qb = this.responseRepository
      .createQueryBuilder('response')
      .select('COUNT(DISTINCT outreach.hubspot_deal_id)', 'deals_influenced')
      .addSelect('COALESCE(SUM(DISTINCT outreach.hubspot_deal_id), 0)', 'pipeline_value')
      .addSelect(
        `COUNT(DISTINCT outreach.hubspot_deal_id) FILTER (WHERE response.action_taken = 'closed_won')`,
        'closed_won_value',
      )
      .addSelect(`COUNT(*) FILTER (WHERE response.intent = 'interested')`, 'deals_advanced')
      .addSelect(`COUNT(*) FILTER (WHERE response.action_taken = 'reopened')`, 'deals_reopened')
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

    const rawData = (await qb.getRawOne()) as DealData;

    return {
      dealsInfluenced: parseInt(rawData?.deals_influenced || '0', 10),
      pipelineValue: parseFloat(rawData?.pipeline_value || '0'),
      closedWonValue: parseFloat(rawData?.closed_won_value || '0'),
      dealsAdvanced: parseInt(rawData?.deals_advanced || '0', 10),
      dealsReopened: parseInt(rawData?.deals_reopened || '0', 10),
    };
  }

  /**
   * Calculate ROI percentage
   */
  private calculateROI(totalCost: number, closedWonValue: number): number {
    if (totalCost === 0) {
      return closedWonValue > 0 ? 100 : 0;
    }

    const profit = closedWonValue - totalCost;
    return Math.round((profit / totalCost) * 100);
  }

  /**
   * Get date format string for time series grouping
   */
  private getDateFormat(granularity: 'daily' | 'weekly' | 'monthly'): string {
    switch (granularity) {
      case 'daily':
        return 'YYYY-MM-DD';
      case 'weekly':
        return 'YYYY-"W"IW';
      case 'monthly':
      default:
        return 'YYYY-MM';
    }
  }
}
