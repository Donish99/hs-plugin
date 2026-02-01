import { useParams, useNavigate } from 'react-router-dom';
import {
  useCampaign,
  useStartCampaign,
  usePauseCampaign,
  useResumeCampaign,
} from '@/api/hooks/useCampaigns';
import { useCampaignMetrics } from '@/api/hooks/useAnalytics';
import { PageHeader } from '@/components/common/PageHeader';
import { TrendChart } from '@/components/charts/TrendChart';
import { Skeleton } from '@/components/ui/skeleton';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable, Column } from '@/components/common/DataTable';
import { formatDateTime, formatNumber, formatPercent } from '@/lib/utils';
import { ArrowLeft, Play, Pause, RefreshCw, Mail, MessageSquare, Eye, MousePointerClick, MessageCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useMemo } from 'react';

export function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const { data: campaign, isLoading } = useCampaign(id || '');
  const { data: campaignAnalytics, isLoading: isAnalyticsLoading } = useCampaignMetrics(id || '');
  const startCampaign = useStartCampaign();
  const pauseCampaign = usePauseCampaign();
  const resumeCampaign = useResumeCampaign();

  type Lead = { id: string; email: string; name: string; status: 'pending' | 'sent' | 'failed' | 'delivered' | 'opened' | 'clicked' | 'replied'; sentAt?: string };

  const leadColumns: Column<Lead>[] = useMemo(
    () => [
      {
        key: 'name' as const,
        header: 'Contact',
        render: (lead: Lead) => (
          <div>
            <p className="font-medium">{lead.name}</p>
            <p className="text-xs text-muted-foreground">{lead.email}</p>
          </div>
        ),
      },
      {
        key: 'status' as const,
        header: 'Status',
        render: (lead: Lead) => (
          <Badge
            variant={
              lead.status === 'replied'
                ? 'success'
                : lead.status === 'failed'
                ? 'destructive'
                : 'secondary'
            }
            className="capitalize"
          >
            {lead.status}
          </Badge>
        ),
      },
      {
        key: 'sentAt' as const,
        header: 'Sent',
        render: (lead: Lead) => (lead.sentAt ? formatDateTime(lead.sentAt) : '-'),
      },
    ],
    []
  );

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Campaign not found</p>
        <Button variant="outline" onClick={() => navigate('/campaigns')}>
          Back to Campaigns
        </Button>
      </div>
    );
  }

  const progress =
    campaign.targetCount > 0 ? (campaign.sentCount / campaign.targetCount) * 100 : 0;

  const handleStart = () => {
    startCampaign.mutate(campaign.id, {
      onSuccess: () => toast({ title: 'Campaign started' }),
      onError: () => toast({ title: 'Failed to start', variant: 'destructive' }),
    });
  };

  const handlePause = () => {
    pauseCampaign.mutate(campaign.id, {
      onSuccess: () => toast({ title: 'Campaign paused' }),
      onError: () => toast({ title: 'Failed to pause', variant: 'destructive' }),
    });
  };

  const handleResume = () => {
    resumeCampaign.mutate(campaign.id, {
      onSuccess: () => toast({ title: 'Campaign resumed' }),
      onError: () => toast({ title: 'Failed to resume', variant: 'destructive' }),
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={campaign.name}
        description={campaign.description}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate('/campaigns')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            {campaign.status === 'draft' && (
              <Button onClick={handleStart}>
                <Play className="mr-2 h-4 w-4" />
                Start Campaign
              </Button>
            )}
            {campaign.status === 'running' && (
              <Button variant="outline" onClick={handlePause}>
                <Pause className="mr-2 h-4 w-4" />
                Pause
              </Button>
            )}
            {campaign.status === 'paused' && (
              <Button onClick={handleResume}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Resume
              </Button>
            )}
          </div>
        }
      />

      {/* Status and Progress */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge
                  variant={
                    campaign.status === 'running'
                      ? 'success'
                      : campaign.status === 'completed'
                      ? 'default'
                      : 'secondary'
                  }
                  className="mt-1 capitalize"
                >
                  {campaign.status}
                </Badge>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                {campaign.channel === 'email' ? (
                  <Mail className="h-5 w-5" />
                ) : campaign.channel === 'sms' ? (
                  <MessageSquare className="h-5 w-5" />
                ) : (
                  <div className="flex gap-0.5">
                    <Mail className="h-4 w-4" />
                    <MessageSquare className="h-4 w-4" />
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardContent className="pt-6 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <span>
                {formatNumber(campaign.sentCount)} / {formatNumber(campaign.targetCount)} sent
              </span>
            </div>
            <Progress value={progress} className="h-3" />
          </CardContent>
        </Card>
      </div>

      {/* Metrics */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
                <Eye className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatPercent(campaign.metrics?.openRate || 0)}</p>
                <p className="text-xs text-muted-foreground">Open Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100">
                <MousePointerClick className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatPercent(campaign.metrics?.clickRate || 0)}</p>
                <p className="text-xs text-muted-foreground">Click Rate</p>
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
                <p className="text-2xl font-bold">{formatPercent(campaign.metrics?.replyRate || 0)}</p>
                <p className="text-xs text-muted-foreground">Reply Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
                <RefreshCw className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatPercent(campaign.metrics?.bounceRate || 0)}</p>
                <p className="text-xs text-muted-foreground">Bounce Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Details and Leads */}
      <Tabs defaultValue="leads">
        <TabsList>
          <TabsTrigger value="leads">Leads ({campaign.leads?.length || 0})</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>
        <TabsContent value="leads" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Campaign Leads</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={leadColumns}
                data={campaign.leads || []}
                keyExtractor={(lead) => lead.id}
                emptyTitle="No leads in this campaign"
              />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="analytics" className="mt-4">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Engagement Trends</CardTitle>
              </CardHeader>
              <CardContent>
                {isAnalyticsLoading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : campaignAnalytics?.trends && campaignAnalytics.trends.length > 0 ? (
                  <TrendChart data={campaignAnalytics.trends} height={300} />
                ) : (
                  <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                    No trend data available yet
                  </div>
                )}
              </CardContent>
            </Card>
            {campaignAnalytics?.channelBreakdown && campaignAnalytics.channelBreakdown.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Channel Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2">
                    {campaignAnalytics.channelBreakdown.map((channel) => (
                      <div key={channel.channel} className="rounded-lg border p-4">
                        <div className="flex items-center gap-2 mb-3">
                          {channel.channel === 'email' ? (
                            <Mail className="h-5 w-5" />
                          ) : (
                            <MessageSquare className="h-5 w-5" />
                          )}
                          <span className="font-medium capitalize">{channel.channel}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center text-sm">
                          <div>
                            <p className="font-semibold">{formatNumber(channel.sent)}</p>
                            <p className="text-xs text-muted-foreground">Sent</p>
                          </div>
                          <div>
                            <p className="font-semibold">{formatNumber(channel.opens)}</p>
                            <p className="text-xs text-muted-foreground">Opens</p>
                          </div>
                          <div>
                            <p className="font-semibold">{formatNumber(channel.replies)}</p>
                            <p className="text-xs text-muted-foreground">Replies</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
        <TabsContent value="details" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Campaign Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-sm text-muted-foreground">Channel</dt>
                  <dd className="font-medium capitalize">{campaign.channel}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">Tone</dt>
                  <dd className="font-medium capitalize">{campaign.tone}</dd>
                </div>
                {campaign.ruleName && (
                  <div>
                    <dt className="text-sm text-muted-foreground">Dormancy Rule</dt>
                    <dd className="font-medium">{campaign.ruleName}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-sm text-muted-foreground">Created</dt>
                  <dd className="font-medium">{formatDateTime(campaign.createdAt)}</dd>
                </div>
                {campaign.startedAt && (
                  <div>
                    <dt className="text-sm text-muted-foreground">Started</dt>
                    <dd className="font-medium">{formatDateTime(campaign.startedAt)}</dd>
                  </div>
                )}
                {campaign.completedAt && (
                  <div>
                    <dt className="text-sm text-muted-foreground">Completed</dt>
                    <dd className="font-medium">{formatDateTime(campaign.completedAt)}</dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
