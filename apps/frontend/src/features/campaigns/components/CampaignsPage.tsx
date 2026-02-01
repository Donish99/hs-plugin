import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCampaigns, useDeleteCampaign, useStartCampaign, usePauseCampaign } from '@/api/hooks/useCampaigns';
import { useCampaignComparison } from '@/api/hooks/useAnalytics';
import { Campaign, CampaignStatus, CampaignsListParams } from '@/api/endpoints/campaigns';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState } from '@/components/common/EmptyState';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, MoreVertical, Play, Pause, Trash2, Megaphone, Eye, GitCompare, X, Check } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatDate, formatNumber, formatPercent } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

const statusColors: Record<CampaignStatus, string> = {
  draft: 'secondary',
  scheduled: 'info',
  running: 'success',
  paused: 'warning',
  completed: 'default',
  failed: 'destructive',
};

function CampaignCard({
  campaign,
  onView,
  onStart,
  onPause,
  onDelete,
  isSelected,
  onSelect,
  compareMode,
}: {
  campaign: Campaign;
  onView: () => void;
  onStart: () => void;
  onPause: () => void;
  onDelete: () => void;
  isSelected?: boolean;
  onSelect?: () => void;
  compareMode?: boolean;
}) {
  const progress = campaign.targetCount > 0 ? (campaign.sentCount / campaign.targetCount) * 100 : 0;
  const openRate = campaign.sentCount > 0 ? (campaign.openCount / campaign.sentCount) * 100 : 0;

  return (
    <Card className={`cursor-pointer hover:shadow-md transition-shadow ${isSelected ? 'ring-2 ring-primary' : ''}`} onClick={compareMode ? onSelect : onView}>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="flex items-start gap-3">
          {compareMode && (
            <Checkbox
              checked={isSelected}
              onCheckedChange={onSelect}
              className="mt-1"
              onClick={(e) => e.stopPropagation()}
            />
          )}
          <div className="space-y-1">
            <CardTitle className="text-base font-medium">{campaign.name}</CardTitle>
          {campaign.description && (
            <p className="text-sm text-muted-foreground line-clamp-1">{campaign.description}</p>
          )}
          </div>
        </div>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Badge variant={statusColors[campaign.status] as "default" | "secondary" | "destructive" | "outline"} className="capitalize">
            {campaign.status}
          </Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onView}>
                <Eye className="mr-2 h-4 w-4" />
                View Details
              </DropdownMenuItem>
              {(campaign.status === 'draft' || campaign.status === 'paused') && (
                <DropdownMenuItem onClick={onStart}>
                  <Play className="mr-2 h-4 w-4" />
                  Start
                </DropdownMenuItem>
              )}
              {campaign.status === 'running' && (
                <DropdownMenuItem onClick={onPause}>
                  <Pause className="mr-2 h-4 w-4" />
                  Pause
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={onDelete} className="text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Channel:</span>{' '}
            <Badge variant="outline" className="capitalize">
              {campaign.channel}
            </Badge>
          </div>
          <div>
            <span className="text-muted-foreground">Targets:</span>{' '}
            {formatNumber(campaign.targetCount)}
          </div>
          <div>
            <span className="text-muted-foreground">Created:</span>{' '}
            {formatDate(campaign.createdAt)}
          </div>
        </div>

        {campaign.status !== 'draft' && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <span>{formatNumber(campaign.sentCount)} / {formatNumber(campaign.targetCount)}</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        {campaign.sentCount > 0 && (
          <div className="grid grid-cols-3 gap-4 pt-2 border-t text-center">
            <div>
              <p className="text-lg font-semibold">{formatPercent(openRate)}</p>
              <p className="text-xs text-muted-foreground">Open Rate</p>
            </div>
            <div>
              <p className="text-lg font-semibold">{formatNumber(campaign.clickCount)}</p>
              <p className="text-xs text-muted-foreground">Clicks</p>
            </div>
            <div>
              <p className="text-lg font-semibold">{formatNumber(campaign.replyCount)}</p>
              <p className="text-xs text-muted-foreground">Replies</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function CampaignsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [filters, setFilters] = useState<CampaignsListParams>({
    page: 1,
    limit: 12,
  });

  const { data, isLoading } = useCampaigns(filters);
  const deleteCampaign = useDeleteCampaign();
  const startCampaign = useStartCampaign();
  const pauseCampaign = usePauseCampaign();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [campaignToDelete, setCampaignToDelete] = useState<Campaign | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState<Set<string>>(new Set());
  const [showCompareDialog, setShowCompareDialog] = useState(false);

  const { data: comparisonData, isLoading: isComparing } = useCampaignComparison(
    Array.from(selectedForCompare)
  );

  const toggleCompareSelection = (campaignId: string) => {
    setSelectedForCompare((prev) => {
      const next = new Set(prev);
      if (next.has(campaignId)) {
        next.delete(campaignId);
      } else if (next.size < 4) {
        next.add(campaignId);
      }
      return next;
    });
  };

  const handleCompare = () => {
    if (selectedForCompare.size >= 2) {
      setShowCompareDialog(true);
    }
  };

  const exitCompareMode = () => {
    setCompareMode(false);
    setSelectedForCompare(new Set());
  };

  const handleDelete = (campaign: Campaign) => {
    setCampaignToDelete(campaign);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (!campaignToDelete) return;
    deleteCampaign.mutate(campaignToDelete.id, {
      onSuccess: () => {
        toast({ title: 'Campaign deleted' });
        setDeleteDialogOpen(false);
        setCampaignToDelete(null);
      },
      onError: () => {
        toast({ title: 'Delete failed', variant: 'destructive' });
      },
    });
  };

  const handleStart = (campaign: Campaign) => {
    startCampaign.mutate(campaign.id, {
      onSuccess: () => {
        toast({ title: 'Campaign started', description: `"${campaign.name}" is now running.` });
      },
      onError: () => {
        toast({ title: 'Start failed', variant: 'destructive' });
      },
    });
  };

  const handlePause = (campaign: Campaign) => {
    pauseCampaign.mutate(campaign.id, {
      onSuccess: () => {
        toast({ title: 'Campaign paused', description: `"${campaign.name}" has been paused.` });
      },
      onError: () => {
        toast({ title: 'Pause failed', variant: 'destructive' });
      },
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campaigns"
        description="Manage your lead reactivation campaigns"
        actions={
          <div className="flex gap-2">
            {compareMode ? (
              <>
                <Button
                  variant="outline"
                  onClick={exitCompareMode}
                >
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
                <Button
                  onClick={handleCompare}
                  disabled={selectedForCompare.size < 2}
                >
                  <GitCompare className="mr-2 h-4 w-4" />
                  Compare ({selectedForCompare.size})
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => setCompareMode(true)}
                  disabled={!data?.campaigns || data.campaigns.length < 2}
                >
                  <GitCompare className="mr-2 h-4 w-4" />
                  Compare
                </Button>
                <Button onClick={() => navigate('/campaigns/new')}>
                  <Plus className="mr-2 h-4 w-4" />
                  New Campaign
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Filters */}
      <div className="flex gap-4">
        <Select
          value={filters.status || 'all'}
          onValueChange={(value) =>
            setFilters((prev) => ({
              ...prev,
              status: value === 'all' ? undefined : (value as CampaignStatus),
            }))
          }
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="running">Running</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.channel || 'all'}
          onValueChange={(value) =>
            setFilters((prev) => ({
              ...prev,
              channel: value === 'all' ? undefined : (value as 'email' | 'sms' | 'both'),
            }))
          }
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Channel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Channels</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="sms">SMS</SelectItem>
            <SelectItem value="both">Both</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Campaign Grid */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : data?.campaigns && data.campaigns.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.campaigns.map((campaign) => (
            <CampaignCard
              key={campaign.id}
              campaign={campaign}
              onView={() => navigate(`/campaigns/${campaign.id}`)}
              onStart={() => handleStart(campaign)}
              onPause={() => handlePause(campaign)}
              onDelete={() => handleDelete(campaign)}
              compareMode={compareMode}
              isSelected={selectedForCompare.has(campaign.id)}
              onSelect={() => toggleCompareSelection(campaign.id)}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Megaphone}
          title="No campaigns yet"
          description="Create your first campaign to start re-engaging dormant leads."
          action={{
            label: 'Create Campaign',
            onClick: () => navigate('/campaigns/new'),
          }}
        />
      )}

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

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Campaign</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{campaignToDelete?.name}"? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Campaign Comparison Dialog */}
      <Dialog open={showCompareDialog} onOpenChange={(open) => {
        setShowCompareDialog(open);
        if (!open) exitCompareMode();
      }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Campaign Comparison</DialogTitle>
          </DialogHeader>
          {isComparing ? (
            <div className="flex justify-center py-8">
              <Skeleton className="h-64 w-full" />
            </div>
          ) : comparisonData && comparisonData.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="py-3 text-left font-medium">Metric</th>
                    {comparisonData.map((c) => (
                      <th key={c.campaignId} className="py-3 text-center font-medium">
                        {c.campaignName}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="py-3 text-muted-foreground">Total Sent</td>
                    {comparisonData.map((c) => (
                      <td key={c.campaignId} className="py-3 text-center font-semibold">
                        {formatNumber(c.metrics.totalSent)}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b">
                    <td className="py-3 text-muted-foreground">Open Rate</td>
                    {comparisonData.map((c) => {
                      const best = Math.max(...comparisonData.map((d) => d.metrics.openRate));
                      return (
                        <td key={c.campaignId} className={`py-3 text-center font-semibold ${c.metrics.openRate === best ? 'text-green-600' : ''}`}>
                          {formatPercent(c.metrics.openRate)}
                          {c.metrics.openRate === best && <Check className="inline ml-1 h-4 w-4" />}
                        </td>
                      );
                    })}
                  </tr>
                  <tr className="border-b">
                    <td className="py-3 text-muted-foreground">Click Rate</td>
                    {comparisonData.map((c) => {
                      const best = Math.max(...comparisonData.map((d) => d.metrics.clickRate));
                      return (
                        <td key={c.campaignId} className={`py-3 text-center font-semibold ${c.metrics.clickRate === best ? 'text-green-600' : ''}`}>
                          {formatPercent(c.metrics.clickRate)}
                          {c.metrics.clickRate === best && <Check className="inline ml-1 h-4 w-4" />}
                        </td>
                      );
                    })}
                  </tr>
                  <tr className="border-b">
                    <td className="py-3 text-muted-foreground">Reply Rate</td>
                    {comparisonData.map((c) => {
                      const best = Math.max(...comparisonData.map((d) => d.metrics.replyRate));
                      return (
                        <td key={c.campaignId} className={`py-3 text-center font-semibold ${c.metrics.replyRate === best ? 'text-green-600' : ''}`}>
                          {formatPercent(c.metrics.replyRate)}
                          {c.metrics.replyRate === best && <Check className="inline ml-1 h-4 w-4" />}
                        </td>
                      );
                    })}
                  </tr>
                  <tr className="border-b">
                    <td className="py-3 text-muted-foreground">ROI</td>
                    {comparisonData.map((c) => {
                      const best = Math.max(...comparisonData.map((d) => d.roi.roi));
                      return (
                        <td key={c.campaignId} className={`py-3 text-center font-semibold ${c.roi.roi === best ? 'text-green-600' : ''}`}>
                          {c.roi.roi.toFixed(1)}x
                          {c.roi.roi === best && <Check className="inline ml-1 h-4 w-4" />}
                        </td>
                      );
                    })}
                  </tr>
                  <tr>
                    <td className="py-3 text-muted-foreground">Conversions</td>
                    {comparisonData.map((c) => (
                      <td key={c.campaignId} className="py-3 text-center font-semibold">
                        {formatNumber(c.roi.conversions)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex justify-center py-8 text-muted-foreground">
              No comparison data available
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
