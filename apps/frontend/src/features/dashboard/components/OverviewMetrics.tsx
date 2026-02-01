import { StatCard } from '@/components/common/StatCard';
import { OverviewMetrics as OverviewMetricsType } from '@/api/endpoints/analytics';
import { Send, Eye, MousePointerClick, MessageCircle } from 'lucide-react';
import { formatNumber, formatPercent } from '@/lib/utils';

interface OverviewMetricsProps {
  data?: OverviewMetricsType;
  isLoading?: boolean;
}

export function OverviewMetrics({ data, isLoading }: OverviewMetricsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="Messages Sent"
        value={data ? formatNumber(data.totalSent) : '0'}
        icon={Send}
        isLoading={isLoading}
      />
      <StatCard
        title="Open Rate"
        value={data ? formatPercent(data.openRate) : '0%'}
        description={data ? `${formatNumber(data.totalOpens)} total opens` : undefined}
        icon={Eye}
        isLoading={isLoading}
      />
      <StatCard
        title="Click Rate"
        value={data ? formatPercent(data.clickRate) : '0%'}
        description={data ? `${formatNumber(data.totalClicks)} total clicks` : undefined}
        icon={MousePointerClick}
        isLoading={isLoading}
      />
      <StatCard
        title="Reply Rate"
        value={data ? formatPercent(data.replyRate) : '0%'}
        description={data ? `${formatNumber(data.totalReplies)} total replies` : undefined}
        icon={MessageCircle}
        isLoading={isLoading}
      />
    </div>
  );
}
