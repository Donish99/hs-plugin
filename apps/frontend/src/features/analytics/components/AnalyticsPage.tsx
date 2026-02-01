import { useState } from 'react';
import {
  useOverviewMetrics,
  useTrends,
  useChannelMetrics,
  useROIMetrics,
  useABTests,
  useTopPerformers,
  useCostBreakdown,
  useDealAttribution,
  useRevenueByPeriod,
  useBenchmarks,
} from '@/api/hooks/useAnalytics';
import { AnalyticsParams } from '@/api/endpoints/analytics';
import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { TrendChart } from '@/components/charts/TrendChart';
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
import { Progress } from '@/components/ui/progress';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Send,
  Eye,
  MousePointerClick,
  MessageCircle,
  DollarSign,
  TrendingUp,
  Mail,
  MessageSquare,
} from 'lucide-react';
import { formatNumber, formatPercent, formatCurrency } from '@/lib/utils';

export function AnalyticsPage() {
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d'>('30d');
  const [params] = useState<AnalyticsParams>({});

  const { data: overview, isLoading: isOverviewLoading } = useOverviewMetrics(params);
  const { data: trends, isLoading: isTrendsLoading } = useTrends({
    ...params,
    interval: dateRange === '7d' ? 'day' : 'week',
  });
  const { data: channels, isLoading: isChannelsLoading } = useChannelMetrics(params);
  const { data: roi, isLoading: isRoiLoading } = useROIMetrics(params);
  const { data: abTests, isLoading: isAbTestsLoading } = useABTests(params);
  const { data: topPerformers, isLoading: isTopLoading } = useTopPerformers(params);
  const { data: costBreakdown, isLoading: isCostLoading } = useCostBreakdown(params);
  const { data: dealAttribution, isLoading: isDealsLoading } = useDealAttribution();
  const { data: revenue, isLoading: isRevenueLoading } = useRevenueByPeriod({
    ...params,
    granularity: dateRange === '7d' ? 'day' : 'week',
  });
  const { data: benchmarks, isLoading: isBenchmarksLoading } = useBenchmarks();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Track campaign performance and ROI"
        actions={
          <Select value={dateRange} onValueChange={(value: '7d' | '30d' | '90d') => setDateRange(value)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Date range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      {/* Overview Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Messages Sent"
          value={overview ? formatNumber(overview.totalSent) : '0'}
          icon={Send}
          isLoading={isOverviewLoading}
        />
        <StatCard
          title="Open Rate"
          value={overview ? formatPercent(overview.openRate) : '0%'}
          description={overview ? `${formatNumber(overview.totalOpens)} opens` : undefined}
          icon={Eye}
          isLoading={isOverviewLoading}
        />
        <StatCard
          title="Click Rate"
          value={overview ? formatPercent(overview.clickRate) : '0%'}
          description={overview ? `${formatNumber(overview.totalClicks)} clicks` : undefined}
          icon={MousePointerClick}
          isLoading={isOverviewLoading}
        />
        <StatCard
          title="Reply Rate"
          value={overview ? formatPercent(overview.replyRate) : '0%'}
          description={overview ? `${formatNumber(overview.totalReplies)} replies` : undefined}
          icon={MessageCircle}
          isLoading={isOverviewLoading}
        />
      </div>

      {/* Trends Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Engagement Trends</CardTitle>
        </CardHeader>
        <CardContent>
          {isTrendsLoading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : trends && trends.length > 0 ? (
            <TrendChart data={trends} height={300} />
          ) : (
            <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
              No trend data available
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Channel Performance */}
        <Card>
          <CardHeader>
            <CardTitle>Channel Performance</CardTitle>
          </CardHeader>
          <CardContent>
            {isChannelsLoading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : channels && channels.length > 0 ? (
              <div className="space-y-4">
                {channels.map((channel) => {
                  const openRate =
                    channel.delivered > 0 ? (channel.opens / channel.delivered) * 100 : 0;
                  const replyRate =
                    channel.delivered > 0 ? (channel.replies / channel.delivered) * 100 : 0;

                  return (
                    <div key={channel.channel} className="space-y-3 rounded-lg border p-4">
                      <div className="flex items-center gap-2">
                        {channel.channel === 'email' ? (
                          <Mail className="h-5 w-5" />
                        ) : (
                          <MessageSquare className="h-5 w-5" />
                        )}
                        <span className="font-medium capitalize">{channel.channel}</span>
                      </div>
                      <div className="grid grid-cols-4 gap-4 text-center">
                        <div>
                          <p className="text-lg font-semibold">{formatNumber(channel.sent)}</p>
                          <p className="text-xs text-muted-foreground">Sent</p>
                        </div>
                        <div>
                          <p className="text-lg font-semibold">{formatPercent(openRate)}</p>
                          <p className="text-xs text-muted-foreground">Opens</p>
                        </div>
                        <div>
                          <p className="text-lg font-semibold">{formatNumber(channel.clicks)}</p>
                          <p className="text-xs text-muted-foreground">Clicks</p>
                        </div>
                        <div>
                          <p className="text-lg font-semibold">{formatPercent(replyRate)}</p>
                          <p className="text-xs text-muted-foreground">Replies</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">
                No channel data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* ROI */}
        <Card>
          <CardHeader>
            <CardTitle>ROI & Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            {isRoiLoading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : roi ? (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg border p-4 text-center">
                    <DollarSign className="mx-auto h-6 w-6 text-green-600" />
                    <p className="mt-2 text-2xl font-bold text-green-600">
                      {formatCurrency(roi.totalRevenue)}
                    </p>
                    <p className="text-xs text-muted-foreground">Total Revenue</p>
                  </div>
                  <div className="rounded-lg border p-4 text-center">
                    <TrendingUp className="mx-auto h-6 w-6 text-blue-600" />
                    <p className="mt-2 text-2xl font-bold text-blue-600">{roi.roi.toFixed(1)}x</p>
                    <p className="text-xs text-muted-foreground">ROI</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 pt-4 border-t">
                  <div className="text-center">
                    <p className="text-lg font-semibold">{formatNumber(roi.reactivatedLeads)}</p>
                    <p className="text-xs text-muted-foreground">Reactivated</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-semibold">{formatNumber(roi.conversions)}</p>
                    <p className="text-xs text-muted-foreground">Conversions</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-semibold">{formatCurrency(roi.avgDealSize)}</p>
                    <p className="text-xs text-muted-foreground">Avg Deal</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">
                No ROI data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* A/B Test Results */}
        <Card>
          <CardHeader>
            <CardTitle>A/B Test Results</CardTitle>
          </CardHeader>
          <CardContent>
            {isAbTestsLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : abTests && abTests.length > 0 ? (
              <div className="space-y-4">
                {abTests.slice(0, 3).map((test) => (
                  <div key={test.testId} className="rounded-lg border p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-medium">{test.testName}</span>
                      <Badge variant={test.status === 'completed' ? 'success' : 'secondary'}>
                        {test.status}
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      {test.variants.map((variant) => (
                        <div
                          key={variant.id}
                          className="flex items-center gap-3 rounded bg-muted/50 p-2"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{variant.name}</span>
                              {variant.isWinner && (
                                <Badge variant="default" className="text-xs">
                                  Winner
                                </Badge>
                              )}
                            </div>
                            <Progress
                              value={variant.openRate}
                              className="mt-1 h-2"
                            />
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold">{formatPercent(variant.openRate)}</p>
                            <p className="text-xs text-muted-foreground">open rate</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                No A/B tests to display
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Performers */}
        <Card>
          <CardHeader>
            <CardTitle>Top Performers</CardTitle>
          </CardHeader>
          <CardContent>
            {isTopLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : topPerformers && topPerformers.length > 0 ? (
              <div className="space-y-3">
                {topPerformers.slice(0, 6).map((performer, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground capitalize">
                        {performer.type.replace('_', ' ')}
                      </p>
                      <p className="truncate font-medium">{performer.value}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold">{performer.performance}%</p>
                      <p className="text-xs text-muted-foreground">{performer.metric}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                No performance data yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cost Breakdown & Revenue */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Cost Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Cost Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {isCostLoading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : costBreakdown ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg border p-3 text-center">
                    <p className="text-xs text-muted-foreground">AI Costs</p>
                    <p className="text-xl font-bold">{formatCurrency(costBreakdown.aiCost)}</p>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <p className="text-xs text-muted-foreground">Email Costs</p>
                    <p className="text-xl font-bold">{formatCurrency(costBreakdown.emailCost)}</p>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <p className="text-xs text-muted-foreground">SMS Costs</p>
                    <p className="text-xl font-bold">{formatCurrency(costBreakdown.smsCost)}</p>
                  </div>
                  <div className="rounded-lg border p-3 text-center bg-muted/50">
                    <p className="text-xs text-muted-foreground">Total Cost</p>
                    <p className="text-xl font-bold">{formatCurrency(costBreakdown.totalCost)}</p>
                  </div>
                </div>
                <div className="border-t pt-4 grid grid-cols-2 gap-4 text-center">
                  <div>
                    <p className="text-sm text-muted-foreground">Cost per Lead</p>
                    <p className="text-lg font-semibold">{formatCurrency(costBreakdown.costPerLead)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Cost per Conversion</p>
                    <p className="text-lg font-semibold">{formatCurrency(costBreakdown.costPerConversion)}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">
                No cost data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Revenue Over Time */}
        <Card>
          <CardHeader>
            <CardTitle>Revenue Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            {isRevenueLoading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : revenue && revenue.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={revenue}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" />
                  <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                    labelFormatter={(label) => `Period: ${label}`}
                  />
                  <Bar dataKey="revenue" fill="#22c55e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">
                No revenue data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Deal Attribution & Industry Benchmarks */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Deal Attribution */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Deal Attribution</CardTitle>
          </CardHeader>
          <CardContent>
            {isDealsLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : dealAttribution && dealAttribution.length > 0 ? (
              <div className="space-y-3 max-h-[300px] overflow-auto">
                {dealAttribution.slice(0, 8).map((deal) => (
                  <div
                    key={deal.dealId}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{deal.dealName}</p>
                      <p className="text-xs text-muted-foreground">
                        {deal.contactEmail} &bull; {deal.campaignName}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold text-green-600">{formatCurrency(deal.amount)}</p>
                      <Badge variant="outline" className="text-xs">{deal.stage}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                No deals attributed yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* Industry Benchmarks */}
        <Card>
          <CardHeader>
            <CardTitle>Industry Benchmarks</CardTitle>
          </CardHeader>
          <CardContent>
            {isBenchmarksLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : benchmarks ? (
              <div className="space-y-4">
                {(['openRate', 'clickRate', 'replyRate', 'conversionRate'] as const).map((metric) => {
                  const comparison = benchmarks.comparison[metric];
                  const isAbove = comparison.yours >= comparison.industry;
                  return (
                    <div key={metric} className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="capitalize">{metric.replace(/Rate$/, ' Rate')}</span>
                        <span className={isAbove ? 'text-green-600' : 'text-orange-600'}>
                          {isAbove ? '+' : ''}{(comparison.yours - comparison.industry).toFixed(1)}% vs industry
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Progress
                          value={Math.min(comparison.percentile, 100)}
                          className="flex-1 h-2"
                        />
                        <span className="text-xs text-muted-foreground w-12 text-right">
                          {comparison.percentile}th
                        </span>
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Yours: {formatPercent(comparison.yours)}</span>
                        <span>Industry: {formatPercent(comparison.industry)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                No benchmark data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
