import { apiClient, withAccountIdV1 } from '../client';

export interface OverviewMetrics {
  totalSent: number;
  totalOpens: number;
  totalClicks: number;
  totalReplies: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  conversionRate: number;
}

export interface TrendDataPoint {
  date: string;
  sent: number;
  opens: number;
  clicks: number;
  replies: number;
}

export interface ChannelMetrics {
  channel: 'email' | 'sms';
  sent: number;
  delivered: number;
  opens: number;
  clicks: number;
  replies: number;
  bounces: number;
  unsubscribes: number;
}

export interface ROIMetrics {
  totalRevenue: number;
  totalCost: number;
  roi: number;
  reactivatedLeads: number;
  conversions: number;
  avgDealSize: number;
}

export interface ABTestResult {
  testId: string;
  testName: string;
  status: 'running' | 'completed';
  variants: Array<{
    id: string;
    name: string;
    sent: number;
    opens: number;
    clicks: number;
    replies: number;
    openRate: number;
    clickRate: number;
    replyRate: number;
    isWinner: boolean;
  }>;
  startedAt: string;
  completedAt?: string;
}

export interface TopPerformer {
  type: 'subject_line' | 'send_time' | 'tone';
  value: string;
  metric: string;
  performance: number;
}

export interface AnalyticsParams {
  startDate?: string;
  endDate?: string;
  campaignId?: string;
  channel?: 'email' | 'sms';
}

export interface CostBreakdown {
  aiCost: number;
  emailCost: number;
  smsCost: number;
  totalCost: number;
  costPerLead: number;
  costPerConversion: number;
}

export interface DealAttribution {
  dealId: string;
  dealName: string;
  amount: number;
  stage: string;
  contactId: string;
  contactEmail: string;
  campaignId: string;
  campaignName: string;
  attributedAt: string;
}

export interface RevenueByPeriod {
  period: string;
  revenue: number;
  deals: number;
  conversions: number;
}

export interface DealStageProgression {
  stages: Array<{
    stage: string;
    count: number;
    value: number;
  }>;
  conversions: {
    total: number;
    rate: number;
  };
}

export interface CampaignComparison {
  campaignId: string;
  campaignName: string;
  metrics: OverviewMetrics;
  roi: ROIMetrics;
}

export interface IndustryBenchmarks {
  openRate: number;
  clickRate: number;
  replyRate: number;
  conversionRate: number;
  avgRoi: number;
}

export interface BenchmarkComparison {
  openRate: { yours: number; industry: number; percentile: number };
  clickRate: { yours: number; industry: number; percentile: number };
  replyRate: { yours: number; industry: number; percentile: number };
  conversionRate: { yours: number; industry: number; percentile: number };
}

// Backend engagement metrics shape (different field names than frontend)
interface BackendEngagementMetrics {
  sent?: number;
  delivered?: number;
  bounced?: number;
  opened?: number;
  clicked?: number;
  replied?: number;
  positiveResponses?: number;
  meetingsScheduled?: number;
  openRate?: number;
  clickRate?: number;
  replyRate?: number;
  deliveryRate?: number;
  bounceRate?: number;
}

export const analyticsApi = {
  /**
   * Get overview metrics
   */
  getOverview: async (params?: AnalyticsParams): Promise<OverviewMetrics> => {
    const response = await apiClient.get<{ engagement: BackendEngagementMetrics }>(
      withAccountIdV1('/analytics/overview'),
      { params }
    );
    const engagement = response.data?.engagement || {};
    // Map backend field names to frontend expected names
    return {
      totalSent: engagement.sent ?? 0,
      totalOpens: engagement.opened ?? 0,
      totalClicks: engagement.clicked ?? 0,
      totalReplies: engagement.replied ?? 0,
      openRate: engagement.openRate ?? 0,
      clickRate: engagement.clickRate ?? 0,
      replyRate: engagement.replyRate ?? 0,
      conversionRate: 0, // Not tracked in backend yet
    };
  },

  /**
   * Get trend data over time
   */
  getTrends: async (
    params?: AnalyticsParams & { interval?: 'day' | 'week' | 'month' }
  ): Promise<TrendDataPoint[]> => {
    const response = await apiClient.get<TrendDataPoint[]>(
      withAccountIdV1('/analytics/time-series'),
      { params: { ...params, granularity: params?.interval } }
    );
    return response.data;
  },

  /**
   * Get metrics by channel
   */
  getByChannel: async (params?: AnalyticsParams): Promise<ChannelMetrics[]> => {
    // Channel breakdown is part of campaign metrics
    const response = await apiClient.get<{ engagement: BackendEngagementMetrics }>(
      withAccountIdV1('/analytics/overview'),
      { params }
    );
    const engagement = response.data?.engagement || {};
    // Return mock channel breakdown based on overview
    return [
      {
        channel: 'email',
        sent: engagement.sent ?? 0,
        delivered: engagement.delivered ?? engagement.sent ?? 0,
        opens: engagement.opened ?? 0,
        clicks: engagement.clicked ?? 0,
        replies: engagement.replied ?? 0,
        bounces: engagement.bounced ?? 0,
        unsubscribes: 0,
      },
    ];
  },

  /**
   * Get ROI metrics
   */
  getROI: async (params?: AnalyticsParams): Promise<ROIMetrics> => {
    const response = await apiClient.get<ROIMetrics>(
      withAccountIdV1('/analytics/roi'),
      { params }
    );
    return response.data;
  },

  /**
   * Get A/B test results
   */
  getABTests: async (_params?: AnalyticsParams): Promise<ABTestResult[]> => {
    // Need to get specific variant group IDs
    // For now return empty array
    return [];
  },

  /**
   * Get top performers
   */
  getTopPerformers: async (_params?: AnalyticsParams): Promise<TopPerformer[]> => {
    const response = await apiClient.get<{
      subjectLines: Array<{ value: string; performance: number }>;
      sendTimes: Array<{ value: string; performance: number }>;
      tones: Array<{ value: string; performance: number }>;
    }>(withAccountIdV1('/analytics/best-performers'));

    const performers: TopPerformer[] = [];
    response.data.subjectLines?.forEach(s => {
      performers.push({ type: 'subject_line', value: s.value, metric: 'open rate', performance: s.performance });
    });
    response.data.sendTimes?.forEach(s => {
      performers.push({ type: 'send_time', value: s.value, metric: 'open rate', performance: s.performance });
    });
    response.data.tones?.forEach(s => {
      performers.push({ type: 'tone', value: s.value, metric: 'reply rate', performance: s.performance });
    });
    return performers;
  },

  /**
   * Get dashboard summary (combined data for dashboard)
   */
  getDashboard: async (): Promise<{
    overview: OverviewMetrics;
    recentTrends: TrendDataPoint[];
    topPerformers: TopPerformer[];
  }> => {
    const [overview, recentTrends, topPerformers] = await Promise.all([
      analyticsApi.getOverview(),
      analyticsApi.getTrends({ interval: 'day' }),
      analyticsApi.getTopPerformers(),
    ]);
    return { overview, recentTrends, topPerformers };
  },

  /**
   * Get campaign-specific metrics
   */
  getCampaignMetrics: async (campaignId: string, params?: AnalyticsParams): Promise<{
    metrics: OverviewMetrics;
    trends: TrendDataPoint[];
    channelBreakdown: ChannelMetrics[];
  }> => {
    const response = await apiClient.get(
      withAccountIdV1(`/analytics/campaigns/${campaignId}`),
      { params }
    );
    return response.data;
  },

  /**
   * Compare multiple campaigns
   */
  compareCampaigns: async (campaignIds: string[]): Promise<CampaignComparison[]> => {
    const response = await apiClient.get<CampaignComparison[]>(
      withAccountIdV1('/analytics/campaigns/compare'),
      { params: { campaignIds: campaignIds.join(',') } }
    );
    return response.data;
  },

  /**
   * Get cost breakdown
   */
  getCostBreakdown: async (params?: AnalyticsParams): Promise<CostBreakdown> => {
    const response = await apiClient.get<CostBreakdown>(
      withAccountIdV1('/analytics/roi/costs'),
      { params }
    );
    return response.data;
  },

  /**
   * Get deal attribution
   */
  getDealAttribution: async (campaignId?: string): Promise<DealAttribution[]> => {
    const response = await apiClient.get<DealAttribution[]>(
      withAccountIdV1('/analytics/roi/deals'),
      { params: { campaignId } }
    );
    return response.data;
  },

  /**
   * Get revenue by period
   */
  getRevenueByPeriod: async (
    params?: AnalyticsParams & { granularity?: 'day' | 'week' | 'month' }
  ): Promise<RevenueByPeriod[]> => {
    const response = await apiClient.get<RevenueByPeriod[]>(
      withAccountIdV1('/analytics/roi/revenue'),
      { params }
    );
    return response.data;
  },

  /**
   * Get deal stage progression
   */
  getDealProgression: async (params?: AnalyticsParams): Promise<DealStageProgression> => {
    const response = await apiClient.get<DealStageProgression>(
      withAccountIdV1('/analytics/roi/progression'),
      { params }
    );
    return response.data;
  },

  /**
   * Get industry benchmarks
   */
  getBenchmarks: async (): Promise<{
    industry: IndustryBenchmarks;
    comparison: BenchmarkComparison;
  }> => {
    const response = await apiClient.get(
      withAccountIdV1('/analytics/benchmarks')
    );
    return response.data;
  },

  /**
   * Export activity log
   */
  exportActivity: async (
    format: 'csv' | 'json',
    params?: AnalyticsParams
  ): Promise<Blob> => {
    const response = await apiClient.get(
      withAccountIdV1('/analytics/activity/export'),
      {
        params: { format, ...params },
        responseType: 'blob',
      }
    );
    return response.data;
  },
};
