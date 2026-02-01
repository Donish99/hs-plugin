import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
console.log(API_BASE_URL);
export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Custom event dispatched when authentication fails (401 response)
 * AuthContext listens for this to handle navigation properly via React Router
 */
export const AUTH_FAILURE_EVENT = 'auth:failure';

/**
 * Get the current account ID from localStorage
 */
export function getAccountId(): string | null {
  return localStorage.getItem('hubspot_account_id');
}

/**
 * Get the current portal ID from localStorage
 */
export function getPortalId(): string | null {
  return localStorage.getItem('hubspot_portal_id');
}

/**
 * Build a path with accountId prefix
 */
export function withAccountId(path: string): string {
  const accountId = getAccountId();
  if (!accountId) {
    throw new Error('No account ID found. Please connect to HubSpot first.');
  }
  return `/accounts/${accountId}${path}`;
}

/**
 * Build a path with accountId prefix for v1 API
 */
export function withAccountIdV1(path: string): string {
  const accountId = getAccountId();
  if (!accountId) {
    throw new Error('No account ID found. Please connect to HubSpot first.');
  }
  return `/v1/accounts/${accountId}${path}`;
}

// Request interceptor - add portalId to requests that need it
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  // Add portalId as query param for hubspot oauth endpoints
  if (config.url?.includes('/hubspot/oauth/')) {
    const portalId = getPortalId();
    if (portalId) {
      config.params = { ...config.params, portal_id: portalId };
    }
  }
  return config;
});

// Response interceptor - handle 401 errors
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Skip 401 handling during OAuth callback flow to avoid race conditions
      if (window.location.pathname === '/oauth/callback') {
        return Promise.reject(error);
      }

      // Clear auth data
      localStorage.removeItem('hubspot_portal_id');
      localStorage.removeItem('hubspot_account_id');

      // Dispatch event instead of hard redirect - let AuthContext handle navigation
      // This prevents bypassing React Router state and causing race conditions
      window.dispatchEvent(new CustomEvent(AUTH_FAILURE_EVENT));
    }
    return Promise.reject(error);
  },
);

// Type-safe API error
export interface ApiError {
  message: string;
  statusCode: number;
  error?: string;
}

export function isApiError(error: unknown): error is AxiosError<ApiError> {
  return axios.isAxiosError(error);
}

export function getErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    return error.response?.data?.message || error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred';
}
