import { useQuery, useMutation } from '@tanstack/react-query';
import { analyticsApi, AnalyticsParams } from '../endpoints/analytics';

export const analyticsKeys = {
  all: ['analytics'] as const,
  overview: (params?: AnalyticsParams) => [...analyticsKeys.all, 'overview', params] as const,
  trends: (params?: AnalyticsParams & { interval?: 'day' | 'week' | 'month' }) =>
    [...analyticsKeys.all, 'trends', params] as const,
  channels: (params?: AnalyticsParams) => [...analyticsKeys.all, 'channels', params] as const,
  roi: (params?: AnalyticsParams) => [...analyticsKeys.all, 'roi', params] as const,
  abTests: (params?: AnalyticsParams) => [...analyticsKeys.all, 'ab-tests', params] as const,
  topPerformers: (params?: AnalyticsParams) =>
    [...analyticsKeys.all, 'top-performers', params] as const,
  dashboard: () => [...analyticsKeys.all, 'dashboard'] as const,
  campaignMetrics: (campaignId: string, params?: AnalyticsParams) =>
    [...analyticsKeys.all, 'campaign', campaignId, params] as const,
  campaignComparison: (campaignIds: string[]) =>
    [...analyticsKeys.all, 'comparison', campaignIds] as const,
  costBreakdown: (params?: AnalyticsParams) =>
    [...analyticsKeys.all, 'costs', params] as const,
  dealAttribution: (campaignId?: string) =>
    [...analyticsKeys.all, 'deals', campaignId] as const,
  revenueByPeriod: (params?: AnalyticsParams & { granularity?: 'day' | 'week' | 'month' }) =>
    [...analyticsKeys.all, 'revenue', params] as const,
  dealProgression: (params?: AnalyticsParams) =>
    [...analyticsKeys.all, 'progression', params] as const,
  benchmarks: () => [...analyticsKeys.all, 'benchmarks'] as const,
};

export function useOverviewMetrics(params?: AnalyticsParams) {
  return useQuery({
    queryKey: analyticsKeys.overview(params),
    queryFn: () => analyticsApi.getOverview(params),
  });
}

export function useTrends(params?: AnalyticsParams & { interval?: 'day' | 'week' | 'month' }) {
  return useQuery({
    queryKey: analyticsKeys.trends(params),
    queryFn: () => analyticsApi.getTrends(params),
  });
}

export function useChannelMetrics(params?: AnalyticsParams) {
  return useQuery({
    queryKey: analyticsKeys.channels(params),
    queryFn: () => analyticsApi.getByChannel(params),
  });
}

export function useROIMetrics(params?: AnalyticsParams) {
  return useQuery({
    queryKey: analyticsKeys.roi(params),
    queryFn: () => analyticsApi.getROI(params),
  });
}

export function useABTests(params?: AnalyticsParams) {
  return useQuery({
    queryKey: analyticsKeys.abTests(params),
    queryFn: () => analyticsApi.getABTests(params),
  });
}

export function useTopPerformers(params?: AnalyticsParams) {
  return useQuery({
    queryKey: analyticsKeys.topPerformers(params),
    queryFn: () => analyticsApi.getTopPerformers(params),
  });
}

export function useDashboardAnalytics() {
  return useQuery({
    queryKey: analyticsKeys.dashboard(),
    queryFn: analyticsApi.getDashboard,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useCampaignMetrics(campaignId: string, params?: AnalyticsParams) {
  return useQuery({
    queryKey: analyticsKeys.campaignMetrics(campaignId, params),
    queryFn: () => analyticsApi.getCampaignMetrics(campaignId, params),
    enabled: !!campaignId,
  });
}

export function useCampaignComparison(campaignIds: string[]) {
  return useQuery({
    queryKey: analyticsKeys.campaignComparison(campaignIds),
    queryFn: () => analyticsApi.compareCampaigns(campaignIds),
    enabled: campaignIds.length >= 2,
  });
}

export function useCostBreakdown(params?: AnalyticsParams) {
  return useQuery({
    queryKey: analyticsKeys.costBreakdown(params),
    queryFn: () => analyticsApi.getCostBreakdown(params),
  });
}

export function useDealAttribution(campaignId?: string) {
  return useQuery({
    queryKey: analyticsKeys.dealAttribution(campaignId),
    queryFn: () => analyticsApi.getDealAttribution(campaignId),
  });
}

export function useRevenueByPeriod(
  params?: AnalyticsParams & { granularity?: 'day' | 'week' | 'month' }
) {
  return useQuery({
    queryKey: analyticsKeys.revenueByPeriod(params),
    queryFn: () => analyticsApi.getRevenueByPeriod(params),
  });
}

export function useDealProgression(params?: AnalyticsParams) {
  return useQuery({
    queryKey: analyticsKeys.dealProgression(params),
    queryFn: () => analyticsApi.getDealProgression(params),
  });
}

export function useBenchmarks() {
  return useQuery({
    queryKey: analyticsKeys.benchmarks(),
    queryFn: analyticsApi.getBenchmarks,
    staleTime: 1000 * 60 * 60, // 1 hour - benchmarks don't change often
  });
}

export function useExportActivity() {
  return useMutation({
    mutationFn: ({ format, params }: { format: 'csv' | 'json'; params?: AnalyticsParams }) =>
      analyticsApi.exportActivity(format, params),
    onSuccess: (blob, { format }) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `activity-log-${new Date().toISOString().split('T')[0]}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });
}
