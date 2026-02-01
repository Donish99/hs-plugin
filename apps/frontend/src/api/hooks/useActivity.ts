import { useQuery, useMutation } from '@tanstack/react-query';
import { activityApi, ActivityListParams } from '../endpoints/activity';

export const activityKeys = {
  all: ['activity'] as const,
  lists: () => [...activityKeys.all, 'list'] as const,
  list: (params?: ActivityListParams) => [...activityKeys.lists(), params] as const,
  recent: (limit?: number) => [...activityKeys.all, 'recent', limit] as const,
  stats: (period?: 'day' | 'week' | 'month') => [...activityKeys.all, 'stats', period] as const,
};

export function useActivities(params?: ActivityListParams) {
  return useQuery({
    queryKey: activityKeys.list(params),
    queryFn: () => activityApi.getAll(params),
  });
}

export function useRecentActivity(limit = 10) {
  return useQuery({
    queryKey: activityKeys.recent(limit),
    queryFn: () => activityApi.getRecent(limit),
    staleTime: 1000 * 60, // 1 minute
  });
}

export function useActivityStats(period?: 'day' | 'week' | 'month') {
  return useQuery({
    queryKey: activityKeys.stats(period),
    queryFn: () => activityApi.getStats(period),
  });
}

export function useExportActivity() {
  return useMutation({
    mutationFn: ({ format, params }: { format: 'csv' | 'json'; params?: ActivityListParams }) =>
      activityApi.export(format, params),
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
