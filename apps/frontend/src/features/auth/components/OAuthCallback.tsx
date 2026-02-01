import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function OAuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setAuthenticated } = useAuth();
  const hasRun = useRef(false);

  const success = searchParams.get('success');
  const portalId = searchParams.get('portal_id');
  const error = searchParams.get('error');

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    if (error) {
      return;
    }

    if (success === 'true' && portalId) {
      // Backend already processed the OAuth, just set auth state
      setAuthenticated(portalId, portalId);
      navigate('/dashboard', { replace: true });
    }
  }, [success, portalId, error, setAuthenticated, navigate]);

  // Error states
  if (error) {
    const errorMessages: Record<string, string> = {
      access_denied: 'You denied access to your HubSpot account.',
      missing_code: 'Missing authorization code from HubSpot.',
      invalid_token: 'Could not verify your HubSpot account.',
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
  if (success === 'true' && portalId) {
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
