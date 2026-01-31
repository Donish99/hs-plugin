import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OutreachRecord } from '../../entities/outreach-record.entity';
import { MessageVariant } from '../../entities/message-variant.entity';

/**
 * Variant performance metrics
 */
export interface VariantPerformance {
  variantId: string;
  variantIndex: number;
  subject: string;
  tone: string;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
}

/**
 * Statistical significance result
 */
export interface StatisticalSignificance {
  pValue: number;
  isSignificant: boolean;
  confidenceLevel: number;
  insufficientData?: boolean;
}

/**
 * A/B test result
 */
export interface AbTestResult {
  variantGroupId: string;
  variants: VariantPerformance[];
  winner?: VariantPerformance;
  significance: StatisticalSignificance;
}

/**
 * Winner recommendation
 */
export interface WinnerRecommendation {
  winnerId: string | null;
  winnerIndex: number | null;
  reason: string;
  isSignificant: boolean;
  confidenceLevel: number;
  improvementPercentage?: number;
}

/**
 * Subject line performance
 */
export interface SubjectLinePerformance {
  subject: string;
  sent: number;
  opened: number;
  openRate: number;
}

/**
 * Send time performance
 */
export interface SendTimePerformance {
  hour: number;
  dayOfWeek: number;
  sent: number;
  opened: number;
  openRate: number;
}

/**
 * Tone performance
 */
export interface TonePerformance {
  tone: string;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
}

/**
 * Raw variant data from database
 */
interface RawVariantData {
  variant_id: string;
  variant_index: string;
  subject: string;
  tone: string;
  sent: string;
  opened: string;
  clicked: string;
  replied: string;
}

// Minimum sample size for statistical significance
const MIN_SAMPLE_SIZE = 30;

@Injectable()
export class AbTestService {
  constructor(
    @InjectRepository(OutreachRecord)
    private readonly outreachRepository: Repository<OutreachRecord>,
    @InjectRepository(MessageVariant)
    private readonly _variantRepository: Repository<MessageVariant>,
  ) {}

  /**
   * Get performance metrics for all variants in a group
   */
  async getVariantPerformance(variantGroupId: string): Promise<VariantPerformance[]> {
    const rawData = await this.outreachRepository
      .createQueryBuilder('outreach')
      .select('outreach.variant_id', 'variant_id')
      .addSelect('outreach.selected_variant_index', 'variant_index')
      .addSelect('variant.subject', 'subject')
      .addSelect('variant.tone', 'tone')
      .addSelect('COUNT(*)', 'sent')
      .addSelect(`COUNT(*) FILTER (WHERE outreach.opened_at IS NOT NULL)`, 'opened')
      .addSelect(`COUNT(*) FILTER (WHERE outreach.clicked_at IS NOT NULL)`, 'clicked')
      .addSelect(`COUNT(*) FILTER (WHERE outreach.replied_at IS NOT NULL)`, 'replied')
      .leftJoin('outreach.variant', 'variant')
      .where('outreach.variant_group_id = :variantGroupId', { variantGroupId })
      .groupBy('outreach.variant_id')
      .addGroupBy('outreach.selected_variant_index')
      .addGroupBy('variant.subject')
      .addGroupBy('variant.tone')
      .orderBy('outreach.selected_variant_index', 'ASC')
      .getRawMany();

    return rawData.map((row: RawVariantData) => this.buildVariantPerformance(row));
  }

  /**
   * Calculate statistical significance between two variants
   */
  async calculateStatisticalSignificance(
    variantA: VariantPerformance,
    variantB: VariantPerformance,
    metric: 'openRate' | 'clickRate' | 'replyRate',
  ): Promise<StatisticalSignificance> {
    const nA = variantA.sent;
    const nB = variantB.sent;

    // Check minimum sample size
    if (nA < MIN_SAMPLE_SIZE || nB < MIN_SAMPLE_SIZE) {
      return {
        pValue: 1,
        isSignificant: false,
        confidenceLevel: 0,
        insufficientData: true,
      };
    }

    // Get the success counts based on metric
    const successA = this.getSuccessCount(variantA, metric);
    const successB = this.getSuccessCount(variantB, metric);

    // Calculate proportions
    const pA = successA / nA;
    const pB = successB / nB;

    // Pooled proportion
    const pPooled = (successA + successB) / (nA + nB);

    // Standard error
    const se = Math.sqrt(pPooled * (1 - pPooled) * (1 / nA + 1 / nB));

    // Avoid division by zero
    if (se === 0) {
      return {
        pValue: 1,
        isSignificant: false,
        confidenceLevel: 0,
      };
    }

    // Z-score
    const zScore = (pA - pB) / se;

    // Two-tailed p-value (approximation using normal distribution)
    const pValue = 2 * (1 - this.normalCDF(Math.abs(zScore)));

    // Significance at 95% confidence
    const isSignificant = pValue < 0.05;

    return {
      pValue: Math.round(pValue * 10000) / 10000,
      isSignificant,
      confidenceLevel: isSignificant ? 95 : Math.round((1 - pValue) * 100),
    };
  }

  /**
   * Get winner recommendation for a variant group
   */
  async getWinnerRecommendation(variantGroupId: string): Promise<WinnerRecommendation> {
    const variants = await this.getVariantPerformance(variantGroupId);

    if (variants.length < 2) {
      return {
        winnerId: variants.length === 1 ? variants[0].variantId : null,
        winnerIndex: variants.length === 1 ? variants[0].variantIndex : null,
        reason: variants.length === 1 ? 'Only one variant' : 'No variants found',
        isSignificant: false,
        confidenceLevel: 0,
      };
    }

    // Find best performer by open rate
    const sortedByOpenRate = [...variants].sort((a, b) => b.openRate - a.openRate);
    const best = sortedByOpenRate[0];
    const secondBest = sortedByOpenRate[1];

    // Calculate statistical significance
    const significance = await this.calculateStatisticalSignificance(best, secondBest, 'openRate');

    if (!significance.isSignificant) {
      return {
        winnerId: best.variantId,
        winnerIndex: best.variantIndex,
        reason: `Variant "${best.subject}" shows higher open rate (${best.openRate}% vs ${secondBest.openRate}%), but difference is not statistically significant`,
        isSignificant: false,
        confidenceLevel: significance.confidenceLevel,
      };
    }

    const improvement = ((best.openRate - secondBest.openRate) / secondBest.openRate) * 100;

    return {
      winnerId: best.variantId,
      winnerIndex: best.variantIndex,
      reason: `Variant "${best.subject}" has ${Math.round(improvement)}% higher open rate than next best variant`,
      isSignificant: true,
      confidenceLevel: significance.confidenceLevel,
      improvementPercentage: Math.round(improvement * 100) / 100,
    };
  }

  /**
   * Get best performing subject lines
   */
  async getBestSubjectLines(
    accountId: string,
    limit: number = 10,
  ): Promise<SubjectLinePerformance[]> {
    const rawData = await this.outreachRepository
      .createQueryBuilder('outreach')
      .select('outreach.subject', 'subject')
      .addSelect('COUNT(*)', 'sent')
      .addSelect(`COUNT(*) FILTER (WHERE outreach.opened_at IS NOT NULL)`, 'opened')
      .addSelect(
        `ROUND(COUNT(*) FILTER (WHERE outreach.opened_at IS NOT NULL)::numeric / NULLIF(COUNT(*), 0) * 100, 0)`,
        'open_rate',
      )
      .where('outreach.account_id = :accountId', { accountId })
      .andWhere('outreach.subject IS NOT NULL')
      .groupBy('outreach.subject')
      .having('COUNT(*) >= :minSent', { minSent: 10 })
      .orderBy('open_rate', 'DESC')
      .limit(limit)
      .getRawMany();

    return rawData.map((row) => ({
      subject: row.subject,
      sent: parseInt(row.sent, 10),
      opened: parseInt(row.opened, 10),
      openRate: parseInt(row.open_rate, 10) || 0,
    }));
  }

  /**
   * Get best performing send times
   */
  async getBestSendTimes(accountId: string): Promise<SendTimePerformance[]> {
    const rawData = await this.outreachRepository
      .createQueryBuilder('outreach')
      .select('EXTRACT(HOUR FROM outreach.sent_at)', 'hour')
      .addSelect('EXTRACT(DOW FROM outreach.sent_at)', 'day_of_week')
      .addSelect('COUNT(*)', 'sent')
      .addSelect(`COUNT(*) FILTER (WHERE outreach.opened_at IS NOT NULL)`, 'opened')
      .addSelect(
        `ROUND(COUNT(*) FILTER (WHERE outreach.opened_at IS NOT NULL)::numeric / NULLIF(COUNT(*), 0) * 100, 0)`,
        'open_rate',
      )
      .where('outreach.account_id = :accountId', { accountId })
      .andWhere('outreach.sent_at IS NOT NULL')
      .groupBy('hour')
      .addGroupBy('day_of_week')
      .having('COUNT(*) >= :minSent', { minSent: 10 })
      .orderBy('open_rate', 'DESC')
      .limit(10)
      .getRawMany();

    return rawData.map((row) => ({
      hour: parseInt(row.hour, 10),
      dayOfWeek: parseInt(row.day_of_week, 10),
      sent: parseInt(row.sent, 10),
      opened: parseInt(row.opened, 10),
      openRate: parseInt(row.open_rate, 10) || 0,
    }));
  }

  /**
   * Get performance comparison by tone
   */
  async getTonePerformance(accountId: string): Promise<TonePerformance[]> {
    const rawData = await this.outreachRepository
      .createQueryBuilder('outreach')
      .select('variant.tone', 'tone')
      .addSelect('COUNT(*)', 'sent')
      .addSelect(`COUNT(*) FILTER (WHERE outreach.opened_at IS NOT NULL)`, 'opened')
      .addSelect(`COUNT(*) FILTER (WHERE outreach.clicked_at IS NOT NULL)`, 'clicked')
      .addSelect(`COUNT(*) FILTER (WHERE outreach.replied_at IS NOT NULL)`, 'replied')
      .leftJoin('outreach.variant', 'variant')
      .where('outreach.account_id = :accountId', { accountId })
      .andWhere('variant.tone IS NOT NULL')
      .groupBy('variant.tone')
      .orderBy(
        `ROUND(COUNT(*) FILTER (WHERE outreach.opened_at IS NOT NULL)::numeric / NULLIF(COUNT(*), 0) * 100, 0)`,
        'DESC',
      )
      .getRawMany();

    return rawData.map((row) => {
      const sent = parseInt(row.sent, 10);
      const opened = parseInt(row.opened, 10);
      const clicked = parseInt(row.clicked, 10);
      const replied = parseInt(row.replied, 10);

      return {
        tone: row.tone,
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
   * Build variant performance from raw data
   */
  private buildVariantPerformance(row: RawVariantData): VariantPerformance {
    const sent = parseInt(row.sent, 10) || 0;
    const opened = parseInt(row.opened, 10) || 0;
    const clicked = parseInt(row.clicked, 10) || 0;
    const replied = parseInt(row.replied, 10) || 0;

    return {
      variantId: row.variant_id,
      variantIndex: parseInt(row.variant_index, 10) || 0,
      subject: row.subject || '',
      tone: row.tone || '',
      sent,
      opened,
      clicked,
      replied,
      openRate: this.calculateRate(opened, sent),
      clickRate: this.calculateRate(clicked, sent),
      replyRate: this.calculateRate(replied, sent),
    };
  }

  /**
   * Get success count based on metric
   */
  private getSuccessCount(
    variant: VariantPerformance,
    metric: 'openRate' | 'clickRate' | 'replyRate',
  ): number {
    switch (metric) {
      case 'openRate':
        return variant.opened;
      case 'clickRate':
        return variant.clicked;
      case 'replyRate':
        return variant.replied;
    }
  }

  /**
   * Calculate rate as a percentage
   */
  private calculateRate(numerator: number, denominator: number): number {
    if (denominator === 0) return 0;
    return Math.round((numerator / denominator) * 100);
  }

  /**
   * Standard normal cumulative distribution function (approximation)
   */
  private normalCDF(x: number): number {
    // Approximation using error function
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return 0.5 * (1.0 + sign * y);
  }
}
