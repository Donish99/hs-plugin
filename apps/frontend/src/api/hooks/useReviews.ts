import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  reviewsApi,
  ReviewsListParams,
  ApproveInput,
  RejectInput,
  EditInput,
  BulkActionInput,
} from '../endpoints/reviews';

export const reviewsKeys = {
  all: ['reviews'] as const,
  lists: () => [...reviewsKeys.all, 'list'] as const,
  list: (params?: ReviewsListParams) => [...reviewsKeys.lists(), params] as const,
  details: () => [...reviewsKeys.all, 'detail'] as const,
  detail: (id: string) => [...reviewsKeys.details(), id] as const,
  stats: () => [...reviewsKeys.all, 'stats'] as const,
};

export function useReviews(params?: ReviewsListParams) {
  return useQuery({
    queryKey: reviewsKeys.list(params),
    queryFn: () => reviewsApi.getAll(params),
  });
}

export function useReview(id: string) {
  return useQuery({
    queryKey: reviewsKeys.detail(id),
    queryFn: () => reviewsApi.getById(id),
    enabled: !!id,
  });
}

export function useReviewStats() {
  return useQuery({
    queryKey: reviewsKeys.stats(),
    queryFn: reviewsApi.getStats,
  });
}

export function useApproveReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ApproveInput) => reviewsApi.approve(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reviewsKeys.lists() });
      queryClient.invalidateQueries({ queryKey: reviewsKeys.stats() });
    },
  });
}

export function useRejectReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: RejectInput) => reviewsApi.reject(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reviewsKeys.lists() });
      queryClient.invalidateQueries({ queryKey: reviewsKeys.stats() });
    },
  });
}

export function useEditReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: EditInput) => reviewsApi.edit(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reviewsKeys.lists() });
      queryClient.invalidateQueries({ queryKey: reviewsKeys.stats() });
    },
  });
}

export function useBulkReviewAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: BulkActionInput) => reviewsApi.bulkAction(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reviewsKeys.lists() });
      queryClient.invalidateQueries({ queryKey: reviewsKeys.stats() });
    },
  });
}

export function useRegenerateMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, tone }: { id: string; tone?: string }) =>
      reviewsApi.regenerate(id, { tone }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: reviewsKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: reviewsKeys.lists() });
    },
  });
}

export function useAutoApprove() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (options?: { minConfidence?: number; ruleIds?: string[] }) =>
      reviewsApi.autoApprove(options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reviewsKeys.lists() });
      queryClient.invalidateQueries({ queryKey: reviewsKeys.stats() });
    },
  });
}

export function useQueueForReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      contactId: string;
      campaignId: string;
      channel: 'email' | 'sms';
      subject?: string;
      body: string;
      tone: string;
    }) => reviewsApi.queueForReview(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reviewsKeys.lists() });
      queryClient.invalidateQueries({ queryKey: reviewsKeys.stats() });
    },
  });
}
