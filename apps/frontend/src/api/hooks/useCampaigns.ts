import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  campaignsApi,
  Campaign,
  CampaignsListParams,
  CreateCampaignInput,
  UpdateCampaignInput,
} from '../endpoints/campaigns';

export const campaignsKeys = {
  all: ['campaigns'] as const,
  lists: () => [...campaignsKeys.all, 'list'] as const,
  list: (params?: CampaignsListParams) => [...campaignsKeys.lists(), params] as const,
  details: () => [...campaignsKeys.all, 'detail'] as const,
  detail: (id: string) => [...campaignsKeys.details(), id] as const,
  stats: () => [...campaignsKeys.all, 'stats'] as const,
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
