import { apiClient, getPortalId } from '../client';

export interface OAuthInstallResponse {
  url: string;
  state: string;
}

export interface OAuthCallbackResponse {
  success: boolean;
  portalId: number;
  accountId: string;
  message: string;
}

export interface ConnectionStatus {
  connected: boolean;
  portalId?: number;
  accountId?: string;
  tokenExpired?: boolean;
  companyName?: string;
}

export const authApi = {
  /**
   * Get the HubSpot OAuth install URL
   * Stores state in sessionStorage for CSRF validation
   */
  getInstallUrl: async (): Promise<OAuthInstallResponse> => {
    const response = await apiClient.get<OAuthInstallResponse>('/hubspot/oauth/install');
    // Store state in sessionStorage for validation when callback returns
    if (response.data.state) {
      sessionStorage.setItem('oauth_state', response.data.state);
    }
    return response.data;
  },

  /**
   * Exchange OAuth code for tokens
   */
  handleCallback: async (code: string): Promise<OAuthCallbackResponse> => {
    const response = await apiClient.get<OAuthCallbackResponse>('/hubspot/oauth/callback', {
      params: { code },
    });
    return response.data;
  },

  /**
   * Get connection status for current portal
   */
  getConnectionStatus: async (): Promise<ConnectionStatus> => {
    const portalId = getPortalId();
    if (!portalId) {
      return { connected: false };
    }
    const response = await apiClient.get<ConnectionStatus>('/hubspot/oauth/status', {
      params: { portal_id: portalId },
    });
    return response.data;
  },

  /**
   * Check if user is connected (simplified version)
   */
  isConnected: async (): Promise<boolean> => {
    try {
      const status = await authApi.getConnectionStatus();
      return status.connected && !status.tokenExpired;
    } catch {
      return false;
    }
  },

  /**
   * Disconnect from HubSpot and revoke tokens
   */
  disconnect: async (): Promise<{ success: boolean }> => {
    const portalId = getPortalId();
    if (!portalId) {
      return { success: false };
    }
    const response = await apiClient.post<{ success: boolean }>('/hubspot/oauth/disconnect', null, {
      params: { portal_id: portalId },
    });
    return response.data;
  },
};
