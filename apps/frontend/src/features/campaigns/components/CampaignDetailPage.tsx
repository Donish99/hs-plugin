import { useParams, useNavigate } from 'react-router-dom';
import {
  useCampaign,
  useStartCampaign,
  usePauseCampaign,
  useResumeCampaign,
  useCampaignOutreach,
} from '@/api/hooks/useCampaigns';
import { OutreachRecord } from '@/api/endpoints/campaigns';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDateTime, formatNumber, formatPercent } from '@/lib/utils';
import { ArrowLeft, Play, Pause, RefreshCw, Mail, MessageSquare, Eye, MousePointerClick, MessageCircle, Users, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useMemo, useState } from 'react';

export function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const { data: campaign, isLoading } = useCampaign(id || '');
  const { data: campaignAnalytics, isLoading: isAnalyticsLoading } = useCampaignMetrics(id || '');
  const { data: outreachData, isLoading: isOutreachLoading } = useCampaignOutreach(id || '');
  const startCampaign = useStartCampaign();
  const pauseCampaign = usePauseCampaign();
  const resumeCampaign = useResumeCampaign();

  const [selectedMessage, setSelectedMessage] = useState<OutreachRecord | null>(null);

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

  const messageColumns: Column<OutreachRecord>[] = useMemo(
    () => [
      {
        key: 'contactName' as const,
        header: 'Recipient',
        render: (record: OutreachRecord) => (
          <div>
            <p className="font-medium">{record.contactName || 'Unknown'}</p>
            <p className="text-xs text-muted-foreground">{record.contactEmail}</p>
          </div>
        ),
      },
      {
        key: 'channel' as const,
        header: 'Channel',
        render: (record: OutreachRecord) => (
          <div className="flex items-center gap-2">
            {record.channel === 'email' ? (
              <Mail className="h-4 w-4" />
            ) : (
              <MessageSquare className="h-4 w-4" />
            )}
            <span className="capitalize">{record.channel}</span>
          </div>
        ),
      },
      {
        key: 'subject' as const,
        header: 'Subject',
        render: (record: OutreachRecord) => (
          <p className="max-w-[200px] truncate text-sm">
            {record.subject || '(No subject)'}
          </p>
        ),
      },
      {
        key: 'status' as const,
        header: 'Status',
        render: (record: OutreachRecord) => (
          <Badge
            variant={
              record.status === 'replied'
                ? 'success'
                : record.status === 'failed' || record.status === 'bounced'
                ? 'destructive'
                : record.status === 'opened' || record.status === 'clicked'
                ? 'default'
                : 'secondary'
            }
            className="capitalize"
          >
            {record.status}
          </Badge>
        ),
      },
      {
        key: 'sentAt' as const,
        header: 'Sent',
        render: (record: OutreachRecord) =>
          record.sentAt ? formatDateTime(record.sentAt) : '-',
      },
      {
        key: 'id' as const,
        header: 'Actions',
        render: (record: OutreachRecord) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedMessage(record)}
          >
            <FileText className="h-4 w-4 mr-1" />
            View
          </Button>
        ),
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
          <TabsTrigger value="leads">
            Leads ({campaign.leads?.length || campaign.targetCount || 0})
          </TabsTrigger>
          <TabsTrigger value="messages">
            Messages ({outreachData?.total || 0})
          </TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>
        <TabsContent value="leads" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Campaign Leads</CardTitle>
            </CardHeader>
            <CardContent>
              {campaign.leads && campaign.leads.length > 0 ? (
                <DataTable
                  columns={leadColumns}
                  data={campaign.leads}
                  keyExtractor={(lead) => lead.id}
                  emptyTitle="No leads in this campaign"
                />
              ) : campaign.targetCount > 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Users className="h-12 w-12 text-muted-foreground mb-3" />
                  <p className="text-lg font-medium">{formatNumber(campaign.targetCount)} leads targeted</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Lead details will be available once messages are generated
                  </p>
                </div>
              ) : (
                <DataTable
                  columns={leadColumns}
                  data={[]}
                  keyExtractor={(lead) => lead.id}
                  emptyTitle="No leads in this campaign"
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="messages" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Sent Messages</CardTitle>
            </CardHeader>
            <CardContent>
              {isOutreachLoading ? (
                <div className="flex justify-center py-8">
                  <LoadingSpinner />
                </div>
              ) : outreachData?.records && outreachData.records.length > 0 ? (
                <DataTable
                  columns={messageColumns}
                  data={outreachData.records}
                  keyExtractor={(record) => record.id}
                  emptyTitle="No messages sent yet"
                />
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Mail className="h-12 w-12 text-muted-foreground mb-3" />
                  <p className="text-lg font-medium">No messages sent yet</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Messages will appear here once the campaign starts sending
                  </p>
                </div>
              )}
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

      {/* Message Detail Dialog */}
      <Dialog open={!!selectedMessage} onOpenChange={() => setSelectedMessage(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedMessage?.channel === 'email' ? (
                <Mail className="h-5 w-5" />
              ) : (
                <MessageSquare className="h-5 w-5" />
              )}
              Message Details
            </DialogTitle>
          </DialogHeader>
          {selectedMessage && (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-4">
                {/* Recipient Info */}
                <div className="grid gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-20">To:</span>
                    <span className="font-medium">
                      {selectedMessage.contactName || 'Unknown'}{' '}
                      {selectedMessage.contactEmail && `<${selectedMessage.contactEmail}>`}
                    </span>
                  </div>
                  {selectedMessage.companyName && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground w-20">Company:</span>
                      <span>{selectedMessage.companyName}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-20">Status:</span>
                    <Badge
                      variant={
                        selectedMessage.status === 'replied'
                          ? 'success'
                          : selectedMessage.status === 'failed' || selectedMessage.status === 'bounced'
                          ? 'destructive'
                          : 'secondary'
                      }
                      className="capitalize"
                    >
                      {selectedMessage.status}
                    </Badge>
                  </div>
                  {selectedMessage.sentAt && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground w-20">Sent:</span>
                      <span>{formatDateTime(selectedMessage.sentAt)}</span>
                    </div>
                  )}
                  {selectedMessage.openedAt && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground w-20">Opened:</span>
                      <span>{formatDateTime(selectedMessage.openedAt)}</span>
                    </div>
                  )}
                  {selectedMessage.clickedAt && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground w-20">Clicked:</span>
                      <span>{formatDateTime(selectedMessage.clickedAt)}</span>
                    </div>
                  )}
                  {selectedMessage.repliedAt && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground w-20">Replied:</span>
                      <span>{formatDateTime(selectedMessage.repliedAt)}</span>
                    </div>
                  )}
                </div>

                {/* Subject (for emails) */}
                {selectedMessage.channel === 'email' && selectedMessage.subject && (
                  <div className="border-t pt-4">
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">Subject</h4>
                    <p className="font-medium">{selectedMessage.subject}</p>
                  </div>
                )}

                {/* Message Body */}
                <div className="border-t pt-4">
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">
                    {selectedMessage.channel === 'email' ? 'Email Body' : 'Message'}
                  </h4>
                  {selectedMessage.bodyHtml ? (
                    <div
                      className="prose prose-sm max-w-none rounded-lg border bg-muted/30 p-4"
                      dangerouslySetInnerHTML={{ __html: selectedMessage.bodyHtml }}
                    />
                  ) : selectedMessage.bodyText ? (
                    <div className="rounded-lg border bg-muted/30 p-4 whitespace-pre-wrap text-sm">
                      {selectedMessage.bodyText}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      Message content not available
                    </p>
                  )}
                </div>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
