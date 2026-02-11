import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  campaignsApi,
  Campaign,
  CampaignsListParams,
  CreateCampaignInput,
  UpdateCampaignInput,
  OutreachStatus,
} from '../endpoints/campaigns';

export const campaignsKeys = {
  all: ['campaigns'] as const,
  lists: () => [...campaignsKeys.all, 'list'] as const,
  list: (params?: CampaignsListParams) => [...campaignsKeys.lists(), params] as const,
  details: () => [...campaignsKeys.all, 'detail'] as const,
  detail: (id: string) => [...campaignsKeys.details(), id] as const,
  stats: () => [...campaignsKeys.all, 'stats'] as const,
  outreach: (campaignId: string, params?: { page?: number; limit?: number; status?: OutreachStatus }) =>
    [...campaignsKeys.detail(campaignId), 'outreach', params] as const,
  outreachRecord: (campaignId: string, recordId: string) =>
    [...campaignsKeys.detail(campaignId), 'outreach', recordId] as const,
};

export function useCampaigns(params?: CampaignsListParams) {
  return useQuery({
    queryKey: campaignsKeys.list(params),
    queryFn: () => campaignsApi.getAll(params),
  });
}

export function useCampaign(id: string) {
  return useQuery({
    queryKey: campaignsKeys.detail(id),
    queryFn: () => campaignsApi.getById(id),
    enabled: !!id,
    // Smart polling: poll every 3 seconds when campaign is running
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.status === 'running' ? 3000 : false;
    },
  });
}

export function useCampaignStats() {
  return useQuery({
    queryKey: campaignsKeys.stats(),
    queryFn: campaignsApi.getStats,
  });
}

export function useCreateCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateCampaignInput) => campaignsApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: campaignsKeys.lists() });
      queryClient.invalidateQueries({ queryKey: campaignsKeys.stats() });
    },
  });
}

export function useUpdateCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCampaignInput }) =>
      campaignsApi.update(id, input),
    onSuccess: (data: Campaign) => {
      queryClient.invalidateQueries({ queryKey: campaignsKeys.lists() });
      queryClient.setQueryData(campaignsKeys.detail(data.id), data);
    },
  });
}

export function useDeleteCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => campaignsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: campaignsKeys.lists() });
      queryClient.invalidateQueries({ queryKey: campaignsKeys.stats() });
    },
  });
}

export function useStartCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => campaignsApi.start(id),
    onSuccess: (data: Campaign) => {
      queryClient.invalidateQueries({ queryKey: campaignsKeys.lists() });
      queryClient.setQueryData(campaignsKeys.detail(data.id), data);
      queryClient.invalidateQueries({ queryKey: campaignsKeys.stats() });
    },
  });
}

export function usePauseCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => campaignsApi.pause(id),
    onSuccess: (data: Campaign) => {
      queryClient.invalidateQueries({ queryKey: campaignsKeys.lists() });
      queryClient.setQueryData(campaignsKeys.detail(data.id), data);
    },
  });
}

export function useResumeCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => campaignsApi.resume(id),
    onSuccess: (data: Campaign) => {
      queryClient.invalidateQueries({ queryKey: campaignsKeys.lists() });
      queryClient.setQueryData(campaignsKeys.detail(data.id), data);
    },
  });
}

export function useAddLeadsToCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, leadIds }: { id: string; leadIds: string[] }) =>
      campaignsApi.addLeads(id, leadIds),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: campaignsKeys.detail(id) });
    },
  });
}

export function useRemoveLeadsFromCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, leadIds }: { id: string; leadIds: string[] }) =>
      campaignsApi.removeLeads(id, leadIds),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: campaignsKeys.detail(id) });
    },
  });
}

export function useCampaignOutreach(
  campaignId: string,
  params?: { page?: number; limit?: number; status?: OutreachStatus },
  isRunning?: boolean
) {
  return useQuery({
    queryKey: campaignsKeys.outreach(campaignId, params),
    queryFn: () => campaignsApi.getOutreachRecords(campaignId, params),
    enabled: !!campaignId,
    // Smart polling: poll every 3 seconds when campaign is running
    refetchInterval: isRunning ? 3000 : false,
  });
}

export function useOutreachRecord(campaignId: string, recordId: string) {
  return useQuery({
    queryKey: campaignsKeys.outreachRecord(campaignId, recordId),
    queryFn: () => campaignsApi.getOutreachRecord(campaignId, recordId),
    enabled: !!campaignId && !!recordId,
  });
}

export function useGenerateMessages() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (campaignId: string) => campaignsApi.generateMessages(campaignId),
    onSuccess: (_, campaignId) => {
      queryClient.invalidateQueries({ queryKey: campaignsKeys.detail(campaignId) });
      queryClient.invalidateQueries({ queryKey: campaignsKeys.outreach(campaignId, undefined) });
    },
  });
}

export function useEditOutreach() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ campaignId, recordId, updates }: {
      campaignId: string;
      recordId: string;
      updates: { subject?: string; bodyText?: string };
    }) =>
      campaignsApi.editOutreach(campaignId, recordId, updates),
    onSuccess: (_, { campaignId }) => {
      queryClient.invalidateQueries({ queryKey: campaignsKeys.outreach(campaignId, undefined) });
    },
  });
}

export function useApproveOutreach() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ campaignId, recordId }: { campaignId: string; recordId: string }) =>
      campaignsApi.approveOutreach(campaignId, recordId),
    onSuccess: (_, { campaignId }) => {
      queryClient.invalidateQueries({ queryKey: campaignsKeys.outreach(campaignId, undefined) });
    },
  });
}

export function useApproveAllOutreach() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (campaignId: string) => campaignsApi.approveAllOutreach(campaignId),
    onSuccess: (_, campaignId) => {
      queryClient.invalidateQueries({ queryKey: campaignsKeys.outreach(campaignId, undefined) });
    },
  });
}

export function useSendApproved() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (campaignId: string) => campaignsApi.sendApproved(campaignId),
    onSuccess: (_, campaignId) => {
      queryClient.invalidateQueries({ queryKey: campaignsKeys.detail(campaignId) });
      queryClient.invalidateQueries({ queryKey: campaignsKeys.outreach(campaignId, undefined) });
    },
  });
}

export function useFailedOutreach(campaignId: string) {
  return useQuery({
    queryKey: [...campaignsKeys.detail(campaignId), 'failed'] as const,
    queryFn: () => campaignsApi.getFailedOutreach(campaignId),
    enabled: !!campaignId,
  });
}

export function useRetryOutreach() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ campaignId, recordId }: { campaignId: string; recordId: string }) =>
      campaignsApi.retryOutreach(campaignId, recordId),
    onSuccess: (_, { campaignId }) => {
      queryClient.invalidateQueries({ queryKey: campaignsKeys.detail(campaignId) });
      queryClient.invalidateQueries({ queryKey: campaignsKeys.outreach(campaignId, undefined) });
      queryClient.invalidateQueries({ queryKey: [...campaignsKeys.detail(campaignId), 'failed'] });
    },
  });
}

export function useRetryAllFailed() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (campaignId: string) => campaignsApi.retryAllFailed(campaignId),
    onSuccess: (_, campaignId) => {
      queryClient.invalidateQueries({ queryKey: campaignsKeys.detail(campaignId) });
      queryClient.invalidateQueries({ queryKey: campaignsKeys.outreach(campaignId, undefined) });
      queryClient.invalidateQueries({ queryKey: [...campaignsKeys.detail(campaignId), 'failed'] });
    },
  });
}
