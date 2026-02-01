import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useInstallUrl } from '@/api/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { AlertCircle, CheckCircle2, Zap, BarChart3, Mail } from 'lucide-react';

export function ConnectPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const installUrlMutation = useInstallUrl();

  // Redirect if already authenticated
  useEffect(() => {
    console.log(isAuthenticated, 'asdas');
    if (isAuthenticated) {
      // navigate('/dashboard');
    }
  }, [isAuthenticated, navigate]);

  const handleConnect = async () => {
    try {
      const { url } = await installUrlMutation.mutateAsync();
      console.log(url);
      window.location.href = url;
    } catch (error) {
      console.error('Failed to get install URL:', error);
    }
  };

  if (isAuthLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-background to-muted p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-foreground">Dormant Lead Reactivation</h1>
          <p className="mt-2 text-muted-foreground">AI-powered lead reactivation for HubSpot</p>
        </div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle>Connect Your HubSpot Account</CardTitle>
            <CardDescription>
              Get started by connecting your HubSpot account to enable dormant lead detection and
              AI-powered reactivation campaigns.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <Zap className="mt-0.5 h-5 w-5 text-hubspot-orange" />
                <div>
                  <p className="font-medium">Automatic Lead Detection</p>
                  <p className="text-sm text-muted-foreground">
                    Identify dormant leads based on customizable rules
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Mail className="mt-0.5 h-5 w-5 text-hubspot-orange" />
                <div>
                  <p className="font-medium">AI-Generated Messages</p>
                  <p className="text-sm text-muted-foreground">
                    Personalized email and SMS content for each lead
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <BarChart3 className="mt-0.5 h-5 w-5 text-hubspot-orange" />
                <div>
                  <p className="font-medium">Performance Analytics</p>
                  <p className="text-sm text-muted-foreground">
                    Track engagement, conversions, and ROI
                  </p>
                </div>
              </div>
            </div>

            {installUrlMutation.error && (
              <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                <span>Failed to connect. Please try again.</span>
              </div>
            )}

            <Button
              onClick={handleConnect}
              className="w-full bg-hubspot-orange hover:bg-hubspot-orange-dark"
              size="lg"
              disabled={installUrlMutation.isPending}
            >
              {installUrlMutation.isPending ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2 text-white" />
                  Connecting...
                </>
              ) : (
                'Connect HubSpot'
              )}
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              By connecting, you agree to allow this app to access your HubSpot account data.
            </p>
          </CardContent>
        </Card>

        <div className="mt-6 flex items-center justify-center gap-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span>Secure OAuth 2.0</span>
          </div>
          <div className="flex items-center gap-1">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span>GDPR Compliant</span>
          </div>
        </div>
      </div>
    </div>
  );
}
