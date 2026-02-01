import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  settingsApi,
  GeneralSettings,
  SendingLimits,
  AISettings,
  NotificationSettings,
} from '../endpoints/settings';

export const settingsKeys = {
  all: ['settings'] as const,
  allSettings: () => [...settingsKeys.all, 'all'] as const,
  usage: () => [...settingsKeys.all, 'usage'] as const,
};

export function useSettings() {
  return useQuery({
    queryKey: settingsKeys.allSettings(),
    queryFn: settingsApi.getAll,
  });
}

export function useUsageStats() {
  return useQuery({
    queryKey: settingsKeys.usage(),
    queryFn: settingsApi.getUsage,
  });
}

export function useUpdateGeneralSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (settings: Partial<GeneralSettings>) => settingsApi.updateGeneral(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.allSettings() });
    },
  });
}

export function useUpdateSendingLimits() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (limits: Partial<SendingLimits>) => settingsApi.updateSendingLimits(limits),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.allSettings() });
      queryClient.invalidateQueries({ queryKey: settingsKeys.usage() });
    },
  });
}

export function useUpdateAISettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (settings: Partial<AISettings>) => settingsApi.updateAI(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.allSettings() });
    },
  });
}

export function useUpdateNotificationSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (settings: Partial<NotificationSettings>) =>
      settingsApi.updateNotifications(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.allSettings() });
    },
  });
}

export function useTestEmail() {
  return useMutation({
    mutationFn: (email: string) => settingsApi.testEmail(email),
  });
}

export function useTestSms() {
  return useMutation({
    mutationFn: (phone: string) => settingsApi.testSms(phone),
  });
}
