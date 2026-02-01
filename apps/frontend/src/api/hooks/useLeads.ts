import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { leadsApi, LeadsListParams } from '../endpoints/leads';

export const leadsKeys = {
  all: ['leads'] as const,
  lists: () => [...leadsKeys.all, 'list'] as const,
  list: (params?: LeadsListParams) => [...leadsKeys.lists(), params] as const,
  details: () => [...leadsKeys.all, 'detail'] as const,
  detail: (id: string) => [...leadsKeys.details(), id] as const,
  stats: () => [...leadsKeys.all, 'stats'] as const,
  activity: (id: string) => [...leadsKeys.all, 'activity', id] as const,
  report: (ruleId: string) => [...leadsKeys.all, 'report', ruleId] as const,
};

export function useLeads(params?: LeadsListParams) {
  return useQuery({
    queryKey: leadsKeys.list(params),
    queryFn: () => leadsApi.getAll(params),
  });
}

export function useLead(id: string) {
  return useQuery({
    queryKey: leadsKeys.detail(id),
    queryFn: () => leadsApi.getById(id),
    enabled: !!id,
  });
}

export function useLeadStats() {
  return useQuery({
    queryKey: leadsKeys.stats(),
    queryFn: leadsApi.getStats,
  });
}

export function useLeadActivity(id: string) {
  return useQuery({
    queryKey: leadsKeys.activity(id),
    queryFn: () => leadsApi.getActivity(id),
    enabled: !!id,
  });
}

export function useTriggerScan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: leadsApi.triggerScan,
    onSuccess: () => {
      // Invalidate after a delay to allow scan to process
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: leadsKeys.lists() });
        queryClient.invalidateQueries({ queryKey: leadsKeys.stats() });
      }, 5000);
    },
  });
}

export function useExportLeads() {
  return useMutation({
    mutationFn: (params?: LeadsListParams) => leadsApi.export(params),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dormant-leads-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });
}

export function useLeadReportByRule(ruleId: string) {
  return useQuery({
    queryKey: leadsKeys.report(ruleId),
    queryFn: () => leadsApi.getReportByRule(ruleId),
    enabled: !!ruleId,
  });
}

export function useCreateCampaignFromLeads() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      leadIds: string[];
      name: string;
      channel: 'email' | 'sms' | 'both';
      tone?: 'professional' | 'friendly' | 'casual';
      scheduledAt?: string;
    }) => leadsApi.createCampaignFromLeads(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
}

export function useBulkSelectLeads() {
  return useMutation({
    mutationFn: (input: {
      ruleId?: string;
      minDormancyScore?: number;
      maxDormancyScore?: number;
      limit?: number;
    }) => leadsApi.bulkSelect(input),
  });
}
