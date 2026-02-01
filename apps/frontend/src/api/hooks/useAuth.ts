import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authApi, OAuthCallbackResponse } from '../endpoints/auth';

export const authKeys = {
  all: ['auth'] as const,
  status: () => [...authKeys.all, 'status'] as const,
};

export function useConnectionStatus() {
  return useQuery({
    queryKey: authKeys.status(),
    queryFn: authApi.getConnectionStatus,
    retry: false,
    staleTime: 1000 * 60 * 10, // 10 minutes
  });
}

// Alias for backwards compatibility
export function useAccountInfo() {
  return useConnectionStatus();
}

export function useInstallUrl() {
  return useMutation({
    mutationFn: authApi.getInstallUrl,
  });
}

export function useOAuthCallback() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ code }: { code: string }) =>
      authApi.handleCallback(code),
    onSuccess: (data: OAuthCallbackResponse) => {
      // Backend returns portalId as number, store as string
      localStorage.setItem('hubspot_portal_id', String(data.portalId));
      // Use portalId as accountId for now - backend should return accountId in future
      localStorage.setItem('hubspot_account_id', String(data.portalId));
      queryClient.invalidateQueries({ queryKey: authKeys.status() });
    },
  });
}

export function useDisconnect() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      // Backend doesn't have a disconnect endpoint yet
      // Just clear local state
      return Promise.resolve();
    },
    onSuccess: () => {
      localStorage.removeItem('hubspot_portal_id');
      localStorage.removeItem('hubspot_account_id');
      queryClient.clear();
    },
  });
}

export function useIsConnected() {
  const { data, isLoading } = useConnectionStatus();
  return {
    isConnected: data?.connected && !data?.tokenExpired,
    isLoading,
    portalId: data?.portalId,
    companyName: data?.companyName,
  };
}
