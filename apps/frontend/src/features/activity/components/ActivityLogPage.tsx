import { useState } from 'react';
import { useActivities, useActivityStats, useExportActivity } from '@/api/hooks/useActivity';
import { ActivityListParams, ActivityType, ActivityItem } from '@/api/endpoints/activity';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState } from '@/components/common/EmptyState';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatDateTime } from '@/lib/utils';
import {
  Users,
  Play,
  CheckCircle,
  Send,
  Mail,
  Eye,
  MousePointerClick,
  MessageCircle,
  AlertCircle,
  FileText,
  Settings,
  Activity,
  Download,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const activityIcons: Record<ActivityType, React.ElementType> = {
  lead_detected: Users,
  campaign_started: Play,
  campaign_completed: CheckCircle,
  message_sent: Send,
  message_delivered: Mail,
  message_opened: Eye,
  message_clicked: MousePointerClick,
  message_replied: MessageCircle,
  message_bounced: AlertCircle,
  rule_created: FileText,
  rule_updated: FileText,
  settings_changed: Settings,
  error: AlertCircle,
};

const activityColors: Record<ActivityType, string> = {
  lead_detected: 'bg-blue-100 text-blue-600',
  campaign_started: 'bg-green-100 text-green-600',
  campaign_completed: 'bg-green-100 text-green-600',
  message_sent: 'bg-orange-100 text-orange-600',
  message_delivered: 'bg-blue-100 text-blue-600',
  message_opened: 'bg-purple-100 text-purple-600',
  message_clicked: 'bg-indigo-100 text-indigo-600',
  message_replied: 'bg-green-100 text-green-600',
  message_bounced: 'bg-red-100 text-red-600',
  rule_created: 'bg-blue-100 text-blue-600',
  rule_updated: 'bg-yellow-100 text-yellow-600',
  settings_changed: 'bg-gray-100 text-gray-600',
  error: 'bg-red-100 text-red-600',
};

const typeLabels: Record<ActivityType, string> = {
  lead_detected: 'Lead Detected',
  campaign_started: 'Campaign Started',
  campaign_completed: 'Campaign Completed',
  message_sent: 'Message Sent',
  message_delivered: 'Message Delivered',
  message_opened: 'Message Opened',
  message_clicked: 'Link Clicked',
  message_replied: 'Reply Received',
  message_bounced: 'Message Bounced',
  rule_created: 'Rule Created',
  rule_updated: 'Rule Updated',
  settings_changed: 'Settings Changed',
  error: 'Error',
};

function ActivityRow({ activity }: { activity: ActivityItem }) {
  const Icon = activityIcons[activity.type] || Activity;
  const colorClass = activityColors[activity.type] || 'bg-gray-100 text-gray-600';

  return (
    <div className="flex items-start gap-4 py-4 border-b last:border-0">
      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', colorClass)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium">{activity.title}</p>
          <Badge variant="outline" className="text-xs capitalize">
            {typeLabels[activity.type]}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">{activity.description}</p>
        {(activity.contactEmail || activity.campaignName) && (
          <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
            {activity.contactEmail && (
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {activity.contactEmail}
              </span>
            )}
            {activity.campaignName && (
              <span className="flex items-center gap-1">
                <Play className="h-3 w-3" />
                {activity.campaignName}
              </span>
            )}
          </div>
        )}
      </div>
      <time className="text-sm text-muted-foreground whitespace-nowrap">
        {formatDateTime(activity.createdAt)}
      </time>
    </div>
  );
}

export function ActivityLogPage() {
  const { toast } = useToast();
  const [filters, setFilters] = useState<ActivityListParams>({
    page: 1,
    limit: 20,
  });

  const { data, isLoading } = useActivities(filters);
  const { data: stats } = useActivityStats('week');
  const exportActivity = useExportActivity();

  const handleExport = (format: 'csv' | 'json') => {
    exportActivity.mutate(
      { format, params: filters },
      {
        onSuccess: () => toast({ title: `Activity log exported as ${format.toUpperCase()}` }),
        onError: () => toast({ title: 'Export failed', variant: 'destructive' }),
      }
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Activity Log"
        description="Track all system events and activities"
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport('csv')}
              disabled={exportActivity.isPending}
            >
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport('json')}
              disabled={exportActivity.isPending}
            >
              <Download className="mr-2 h-4 w-4" />
              Export JSON
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
                <Activity className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.total || 0}</p>
                <p className="text-xs text-muted-foreground">This Week</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
                <MessageCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {(stats?.byType?.message_replied || 0) + (stats?.byType?.message_opened || 0)}
                </p>
                <p className="text-xs text-muted-foreground">Engagements</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
                <AlertCircle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.errors || 0}</p>
                <p className="text-xs text-muted-foreground">Errors</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <Select
          value={filters.type || 'all'}
          onValueChange={(value) =>
            setFilters((prev) => ({
              ...prev,
              type: value === 'all' ? undefined : (value as ActivityType),
              page: 1,
            }))
          }
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {Object.entries(typeLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Activity List */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="flex items-start gap-4 py-4">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
          ) : data?.activities && data.activities.length > 0 ? (
            <div>
              {data.activities.map((activity) => (
                <ActivityRow key={activity.id} activity={activity} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Activity}
              title="No activity yet"
              description="Activity will appear here as you use the system."
            />
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {data && data.total > filters.limit! && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={filters.page === 1}
            onClick={() => setFilters((prev) => ({ ...prev, page: (prev.page || 1) - 1 }))}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {filters.page} of {Math.ceil(data.total / filters.limit!)}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={filters.page! * filters.limit! >= data.total}
            onClick={() => setFilters((prev) => ({ ...prev, page: (prev.page || 1) + 1 }))}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
