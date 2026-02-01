import { useRecentActivity } from '@/api/hooks/useActivity';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { ActivityItem, ActivityType } from '@/api/endpoints/activity';
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
} from 'lucide-react';
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
  lead_detected: 'text-blue-500',
  campaign_started: 'text-green-500',
  campaign_completed: 'text-green-600',
  message_sent: 'text-hubspot-orange',
  message_delivered: 'text-blue-500',
  message_opened: 'text-purple-500',
  message_clicked: 'text-indigo-500',
  message_replied: 'text-green-500',
  message_bounced: 'text-red-500',
  rule_created: 'text-blue-500',
  rule_updated: 'text-yellow-500',
  settings_changed: 'text-gray-500',
  error: 'text-red-500',
};

function ActivityItemRow({ activity }: { activity: ActivityItem }) {
  const Icon = activityIcons[activity.type] || AlertCircle;
  const colorClass = activityColors[activity.type] || 'text-gray-500';

  return (
    <div className="flex items-start gap-3 py-3">
      <div className={cn('mt-0.5', colorClass)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{activity.title}</p>
        <p className="text-xs text-muted-foreground truncate">{activity.description}</p>
      </div>
      <time className="text-xs text-muted-foreground whitespace-nowrap">
        {formatDateTime(activity.createdAt)}
      </time>
    </div>
  );
}

export function RecentActivity() {
  const { data: activities, isLoading } = useRecentActivity(10);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3">
                  <Skeleton className="h-4 w-4 rounded" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : activities && activities.length > 0 ? (
            <div className="divide-y">
              {activities.map((activity) => (
                <ActivityItemRow key={activity.id} activity={activity} />
              ))}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No recent activity
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
