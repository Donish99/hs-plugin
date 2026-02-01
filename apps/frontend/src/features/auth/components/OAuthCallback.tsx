import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { authKeys } from '@/api/hooks/useAuth';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function OAuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setAuthenticated } = useAuth();
  const hasRun = useRef(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const success = searchParams.get('success');
  const portalId = searchParams.get('portal_id');
  const accountId = searchParams.get('account_id');
  const error = searchParams.get('error');

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    if (error) {
      // Clear any stored OAuth state
      sessionStorage.removeItem('oauth_state');
      return;
    }

    if (success === 'true' && portalId && accountId) {
      setIsProcessing(true);

      // Clear OAuth state from sessionStorage
      sessionStorage.removeItem('oauth_state');

      // Backend already processed the OAuth, set auth state with proper accountId (UUID)
      setAuthenticated(portalId, accountId);

      // Use queueMicrotask to ensure React state updates propagate
      // before invalidating queries and navigating
      queueMicrotask(async () => {
        // Wait for query invalidation to complete (use the new portalId in the key)
        await queryClient.invalidateQueries({ queryKey: authKeys.status(portalId) });

        // Navigate to dashboard
        navigate('/dashboard', { replace: true });
      });
    } else if (success === 'true' && portalId && !accountId) {
      // Fallback for backwards compatibility - use portalId as accountId
      // This should rarely happen with the updated backend
      setIsProcessing(true);
      sessionStorage.removeItem('oauth_state');
      setAuthenticated(portalId, portalId);

      queueMicrotask(async () => {
        await queryClient.invalidateQueries({ queryKey: authKeys.status(portalId) });
        navigate('/dashboard', { replace: true });
      });
    }
  }, [success, portalId, accountId, error, setAuthenticated, navigate, queryClient]);

  // Error states
  if (error) {
    const errorMessages: Record<string, string> = {
      access_denied: 'You denied access to your HubSpot account.',
      missing_code: 'Missing authorization code from HubSpot.',
      invalid_token: 'Could not verify your HubSpot account.',
      invalid_state: 'Invalid or expired authorization request. Please try again.',
      auth_failed: 'Failed to authenticate with HubSpot.',
    };

    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="rounded-full bg-destructive/10 p-3">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Authorization Failed</h1>
            <p className="mt-1 text-muted-foreground">
              {errorMessages[error] || `Error: ${error}`}
            </p>
          </div>
          <Button onClick={() => navigate('/connect')} variant="outline">
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  // Success state (brief moment before redirect)
  if ((success === 'true' && portalId) || isProcessing) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="rounded-full bg-green-100 p-3">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Connected Successfully!</h1>
            <p className="mt-1 text-muted-foreground">Redirecting to dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  // Loading/processing state
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="flex flex-col items-center gap-4 text-center">
        <LoadingSpinner size="lg" />
        <div>
          <h1 className="text-xl font-semibold">Connecting to HubSpot</h1>
          <p className="mt-1 text-muted-foreground">Please wait while we complete the setup...</p>
        </div>
      </div>
    </div>
  );
}
