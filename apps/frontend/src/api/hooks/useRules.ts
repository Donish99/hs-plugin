import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  rulesApi,
  DormancyRule,
  CreateRuleInput,
  UpdateRuleInput,
} from '../endpoints/rules';

export const rulesKeys = {
  all: ['rules'] as const,
  lists: () => [...rulesKeys.all, 'list'] as const,
  list: () => [...rulesKeys.lists()] as const,
  details: () => [...rulesKeys.all, 'detail'] as const,
  detail: (id: string) => [...rulesKeys.details(), id] as const,
};

export function useRules() {
  return useQuery({
    queryKey: rulesKeys.list(),
    queryFn: rulesApi.getAll,
  });
}

export function useRule(id: string) {
  return useQuery({
    queryKey: rulesKeys.detail(id),
    queryFn: () => rulesApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateRuleInput) => rulesApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rulesKeys.lists() });
    },
  });
}

export function useUpdateRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateRuleInput }) =>
      rulesApi.update(id, input),
    onSuccess: (data: DormancyRule) => {
      queryClient.invalidateQueries({ queryKey: rulesKeys.lists() });
      queryClient.setQueryData(rulesKeys.detail(data.id), data);
    },
  });
}

export function useDeleteRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => rulesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rulesKeys.lists() });
    },
  });
}

export function useToggleRuleActive() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => rulesApi.toggleActive(id),
    onSuccess: (data: DormancyRule) => {
      queryClient.invalidateQueries({ queryKey: rulesKeys.lists() });
      queryClient.setQueryData(rulesKeys.detail(data.id), data);
    },
  });
}
