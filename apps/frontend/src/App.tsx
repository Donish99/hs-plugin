import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './features/auth/context/AuthContext';
import { AppLayout } from './components/layout/AppLayout';
import { ConnectPage } from './features/auth/components/ConnectPage';
import { OAuthCallback } from './features/auth/components/OAuthCallback';
import { DashboardPage } from './features/dashboard/components/DashboardPage';
import { LeadsPage } from './features/leads/components/LeadsPage';
import { LeadDetailPage } from './features/leads/components/LeadDetailPage';
import { CampaignsPage } from './features/campaigns/components/CampaignsPage';
import { CreateCampaignWizard } from './features/campaigns/components/CreateCampaignWizard';
import { CampaignDetailPage } from './features/campaigns/components/CampaignDetailPage';
import { RulesPage } from './features/rules/components/RulesPage';
import { RuleEditorPage } from './features/rules/components/RuleEditorPage';
import { ReviewQueuePage } from './features/reviews/components/ReviewQueuePage';
import { AnalyticsPage } from './features/analytics/components/AnalyticsPage';
import { ActivityLogPage } from './features/activity/components/ActivityLogPage';
import { SettingsPage } from './features/settings/components/SettingsPage';
import { LoadingSpinner } from './components/common/LoadingSpinner';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/connect" replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/connect" element={<ConnectPage />} />
      <Route path="/oauth/callback" element={<OAuthCallback />} />

      {/* Protected routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="leads" element={<LeadsPage />} />
        <Route path="leads/:contactId" element={<LeadDetailPage />} />
        <Route path="campaigns" element={<CampaignsPage />} />
        <Route path="campaigns/new" element={<CreateCampaignWizard />} />
        <Route path="campaigns/:id" element={<CampaignDetailPage />} />
        <Route path="rules" element={<RulesPage />} />
        <Route path="rules/new" element={<RuleEditorPage />} />
        <Route path="rules/:id" element={<RuleEditorPage />} />
        <Route path="reviews" element={<ReviewQueuePage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="activity" element={<ActivityLogPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      {/* Catch all */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;
