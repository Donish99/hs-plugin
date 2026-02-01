import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAccountInfo, useDisconnect } from '@/api/hooks/useAuth';
import { ConnectionStatus } from '@/api/endpoints/auth';
import { useLocation, useNavigate } from 'react-router-dom';
import { AUTH_FAILURE_EVENT } from '@/api/client';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  connectionStatus: ConnectionStatus | null;
  portalId: string | null;
  accountId: string | null;
  companyName: string | null;
  logout: () => void;
  setAuthenticated: (portalId: string, accountId: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [portalId, setPortalId] = useState<string | null>(() =>
    localStorage.getItem('hubspot_portal_id')
  );
  const [accountId, setAccountId] = useState<string | null>(() =>
    localStorage.getItem('hubspot_account_id')
  );
  const location = useLocation();
  const navigate = useNavigate();
  const authTimestamp = useRef<number>(0); // Timestamp when authentication was set
  const isOAuthFlow = useRef(false);
  const AUTH_GRACE_PERIOD = 5000; // 5 seconds grace period after authentication

  const { data: connectionStatus, isLoading: isLoadingStatus, error } = useAccountInfo(portalId);
  const disconnectMutation = useDisconnect();

  const isAuthenticated = !!portalId && connectionStatus?.connected === true && !connectionStatus?.tokenExpired;
  const isLoading = !!portalId && isLoadingStatus;

  // Track OAuth flow state
  useEffect(() => {
    if (location.pathname === '/oauth/callback') {
      isOAuthFlow.current = true;
    }
  }, [location.pathname]);

  // Listen for auth failure events from API client
  useEffect(() => {
    const handleAuthFailure = () => {
      // Don't redirect during OAuth flow
      if (isOAuthFlow.current || location.pathname === '/oauth/callback') {
        return;
      }

      setPortalId(null);
      setAccountId(null);
      navigate('/connect', { replace: true });
    };

    window.addEventListener(AUTH_FAILURE_EVENT, handleAuthFailure);
    return () => window.removeEventListener(AUTH_FAILURE_EVENT, handleAuthFailure);
  }, [navigate, location.pathname]);

  // Handle auth errors - but don't clear during OAuth callback flow
  useEffect(() => {
    // Don't clear auth if we're on the OAuth callback page (OAuth flow in progress)
    if (location.pathname === '/oauth/callback' || isOAuthFlow.current) {
      return;
    }

    // Don't clear if we recently authenticated (grace period for queries to settle)
    const timeSinceAuth = Date.now() - authTimestamp.current;
    if (authTimestamp.current > 0 && timeSinceAuth < AUTH_GRACE_PERIOD) {
      return;
    }

    // Only clear if we have a portalId but server says not connected
    // This prevents clearing on initial mount when localStorage is empty
    if (portalId && (error || (connectionStatus && !connectionStatus.connected))) {
      localStorage.removeItem('hubspot_portal_id');
      localStorage.removeItem('hubspot_account_id');
      setPortalId(null);
      setAccountId(null);
    }
  }, [error, connectionStatus, location.pathname, portalId]);

  // Sync accountId from connection status if we have portalId but missing accountId
  useEffect(() => {
    if (portalId && connectionStatus?.accountId && !accountId) {
      localStorage.setItem('hubspot_account_id', connectionStatus.accountId);
      setAccountId(connectionStatus.accountId);
    }
  }, [portalId, connectionStatus?.accountId, accountId]);

  const setAuthenticated = useCallback((newPortalId: string, newAccountId: string) => {
    authTimestamp.current = Date.now();
    isOAuthFlow.current = false;
    localStorage.setItem('hubspot_portal_id', newPortalId);
    localStorage.setItem('hubspot_account_id', newAccountId);
    setPortalId(newPortalId);
    setAccountId(newAccountId);
  }, []);

  const logout = useCallback(() => {
    disconnectMutation.mutate(undefined, {
      onSettled: () => {
        localStorage.removeItem('hubspot_portal_id');
        localStorage.removeItem('hubspot_account_id');
        setPortalId(null);
        setAccountId(null);
        navigate('/connect', { replace: true });
      },
    });
  }, [disconnectMutation, navigate]);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        connectionStatus: connectionStatus ?? null,
        portalId,
        accountId,
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
