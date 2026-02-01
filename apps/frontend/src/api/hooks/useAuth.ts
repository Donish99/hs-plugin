import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authApi, OAuthCallbackResponse } from '../endpoints/auth';

export const authKeys = {
  all: ['auth'] as const,
  status: (portalId?: string | null) => [...authKeys.all, 'status', portalId ?? 'none'] as const,
};

export function useConnectionStatus(portalId: string | null) {
  return useQuery({
    queryKey: authKeys.status(portalId),
    queryFn: authApi.getConnectionStatus,
    retry: false,
    staleTime: 1000 * 60 * 10, // 10 minutes
    enabled: !!portalId, // Only run query when we have a portalId
  });
}

// Alias for backwards compatibility
export function useAccountInfo(portalId: string | null) {
  return useConnectionStatus(portalId);
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
      // Call backend to revoke tokens
      return authApi.disconnect();
    },
    onSuccess: () => {
      localStorage.removeItem('hubspot_portal_id');
      localStorage.removeItem('hubspot_account_id');
      queryClient.clear();
    },
    onError: () => {
      // Even if backend fails, clear local state
      localStorage.removeItem('hubspot_portal_id');
      localStorage.removeItem('hubspot_account_id');
      queryClient.clear();
    },
  });
}

export function useIsConnected(portalId: string | null) {
  const { data, isLoading } = useConnectionStatus(portalId);
  return {
    isConnected: data?.connected && !data?.tokenExpired,
    isLoading,
    portalId: data?.portalId,
    companyName: data?.companyName,
  };
}
