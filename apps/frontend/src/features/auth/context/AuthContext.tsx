import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAccountInfo, useDisconnect } from '@/api/hooks/useAuth';
import { ConnectionStatus } from '@/api/endpoints/auth';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  connectionStatus: ConnectionStatus | null;
  portalId: string | null;
  companyName: string | null;
  logout: () => void;
  setAuthenticated: (portalId: string, accountId: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [portalId, setPortalId] = useState<string | null>(() =>
    localStorage.getItem('hubspot_portal_id')
  );

  const { data: connectionStatus, isLoading: isLoadingStatus, error } = useAccountInfo();
  const disconnectMutation = useDisconnect();

  const isAuthenticated = !!portalId && connectionStatus?.connected === true && !connectionStatus?.tokenExpired;
  const isLoading = !!portalId && isLoadingStatus;

  // Handle auth errors
  useEffect(() => {
    if (error || (connectionStatus && !connectionStatus.connected)) {
      localStorage.removeItem('hubspot_portal_id');
      localStorage.removeItem('hubspot_account_id');
      setPortalId(null);
    }
  }, [error, connectionStatus]);

  const setAuthenticated = useCallback((newPortalId: string, accountId: string) => {
    localStorage.setItem('hubspot_portal_id', newPortalId);
    localStorage.setItem('hubspot_account_id', accountId);
    setPortalId(newPortalId);
  }, []);

  const logout = useCallback(() => {
    disconnectMutation.mutate(undefined, {
      onSettled: () => {
        localStorage.removeItem('hubspot_portal_id');
        localStorage.removeItem('hubspot_account_id');
        setPortalId(null);
        window.location.href = '/connect';
      },
    });
  }, [disconnectMutation]);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        connectionStatus: connectionStatus ?? null,
        portalId,
        companyName: connectionStatus?.companyName ?? null,
        logout,
        setAuthenticated,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
