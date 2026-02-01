import { useDashboardAnalytics } from '@/api/hooks/useAnalytics';
import { useLeadStats } from '@/api/hooks/useLeads';
import { useReviewStats } from '@/api/hooks/useReviews';
import { PageHeader } from '@/components/common/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendChart } from '@/components/charts/TrendChart';
import { OverviewMetrics } from './OverviewMetrics';
import { RecentActivity } from './RecentActivity';
import { QuickActions } from './QuickActions';
import { StatCard } from '@/components/common/StatCard';
import { Users, MessageSquare, AlertCircle } from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function DashboardPage() {
  const navigate = useNavigate();
  const { data: dashboardData, isLoading: isDashboardLoading } = useDashboardAnalytics();
  const { data: leadStats, isLoading: isLeadsLoading } = useLeadStats();
  const { data: reviewStats, isLoading: isReviewsLoading } = useReviewStats();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Overview of your dormant lead reactivation campaigns"
      />

      {/* Key Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title="Dormant Leads"
          value={leadStats ? formatNumber(leadStats.totalDormant) : '0'}
          description={
            leadStats ? `Avg. ${leadStats.avgDormancyDays} days since contact` : undefined
          }
          icon={Users}
          isLoading={isLeadsLoading}
        />
        <StatCard
          title="Pending Reviews"
          value={reviewStats ? formatNumber(reviewStats.pending) : '0'}
          description="Messages awaiting approval"
          icon={MessageSquare}
          isLoading={isReviewsLoading}
        />
        {reviewStats && reviewStats.pending > 0 && (
          <Card className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-yellow-100 p-2">
                <AlertCircle className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm font-medium">Action Required</p>
                <p className="text-xs text-muted-foreground">
                  {reviewStats.pending} messages need review
                </p>
              </div>
            </div>
            <Button size="sm" onClick={() => navigate('/reviews')}>
              Review Now
            </Button>
          </Card>
        )}
      </div>

      {/* Overview Metrics */}
      <OverviewMetrics data={dashboardData?.overview} isLoading={isDashboardLoading} />

      {/* Charts and Activity */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Engagement Trends (Last 7 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            {isDashboardLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : dashboardData?.recentTrends && dashboardData.recentTrends.length > 0 ? (
              <TrendChart data={dashboardData.recentTrends} />
            ) : (
              <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                No trend data available yet
              </div>
            )}
          </CardContent>
        </Card>

        <QuickActions />
      </div>

      {/* Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecentActivity />
        </div>

        {/* Top Performers */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Top Performers</CardTitle>
          </CardHeader>
          <CardContent>
            {isDashboardLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : dashboardData?.topPerformers && dashboardData.topPerformers.length > 0 ? (
              <div className="space-y-4">
                {dashboardData.topPerformers.slice(0, 5).map((performer, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted-foreground capitalize">
                        {performer.type.replace('_', ' ')}
                      </p>
                      <p className="truncate text-sm font-medium">{performer.value}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">{performer.performance}%</p>
                      <p className="text-xs text-muted-foreground">{performer.metric}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                No performance data yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
