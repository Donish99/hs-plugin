import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLeads, useTriggerScan, useBulkSelectLeads, useCreateCampaignFromLeads } from '@/api/hooks/useLeads';
import { LeadsListParams, DormantLead } from '@/api/endpoints/leads';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LeadsFilters } from './LeadsFilters';
import { LeadDetailDrawer } from './LeadDetailDrawer';
import { formatDate, formatNumber, downloadCSV } from '@/lib/utils';
import { Download, RefreshCw, Wand2, Rocket } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export function LeadsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [filters, setFilters] = useState<LeadsListParams>({
    page: 1,
    limit: 20,
    sortBy: 'dormancyScore',
    sortOrder: 'desc',
  });

  const [selectedLead, setSelectedLead] = useState<DormantLead | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [showCampaignDialog, setShowCampaignDialog] = useState(false);
  const [campaignName, setCampaignName] = useState('');
  const [campaignChannel, setCampaignChannel] = useState<'email' | 'sms' | 'both'>('email');
  const [campaignTone, setCampaignTone] = useState<'professional' | 'friendly' | 'casual'>('professional');

  const { data, isLoading } = useLeads(filters);
  const triggerScan = useTriggerScan();
  const bulkSelect = useBulkSelectLeads();
  const createCampaign = useCreateCampaignFromLeads();

  // Client-side search filtering (backend doesn't support search yet)
  const filteredLeads = useMemo(() => {
    const leads = data?.leads || [];
    if (!filters.search?.trim()) {
      return leads;
    }
    const searchLower = filters.search.toLowerCase();
    return leads.filter((lead) => {
      const name = [lead.firstName, lead.lastName].filter(Boolean).join(' ').toLowerCase();
      const email = (lead.email || '').toLowerCase();
      const company = (lead.company || '').toLowerCase();
      return name.includes(searchLower) || email.includes(searchLower) || company.includes(searchLower);
    });
  }, [data?.leads, filters.search]);

  const columns: Column<DormantLead>[] = useMemo(
    () => [
      {
        key: 'name',
        header: 'Contact',
        sortable: true,
        render: (lead) => {
          const name = [lead.firstName, lead.lastName].filter(Boolean).join(' ') || 'Unknown';
          return (
            <div>
              <p className="font-medium">{name}</p>
              <p className="text-xs text-muted-foreground">{lead.email}</p>
            </div>
          );
        },
      },
      {
        key: 'company',
        header: 'Company',
        render: (lead) => lead.company || '-',
      },
      {
        key: 'dormancyScore',
        header: 'Score',
        sortable: true,
        render: (lead) => (
          <Badge
            variant={lead.dormancyScore >= 80 ? 'destructive' : lead.dormancyScore >= 50 ? 'warning' : 'secondary'}
          >
            {Math.round(lead.dormancyScore)}
          </Badge>
        ),
      },
      {
        key: 'daysDormant',
        header: 'Days Dormant',
        sortable: true,
        render: (lead) => `${lead.daysDormant} days`,
      },
      {
        key: 'lastContactDate',
        header: 'Last Contact',
        sortable: true,
        render: (lead) => (lead.lastContactDate ? formatDate(lead.lastContactDate) : 'Never'),
      },
      {
        key: 'matchedRuleName',
        header: 'Rule',
        render: (lead) =>
          lead.matchedRuleName ? (
            <Badge variant="outline">{lead.matchedRuleName}</Badge>
          ) : (
            '-'
          ),
      },
      {
        key: 'lifecycleStage',
        header: 'Stage',
        render: (lead) =>
          lead.lifecycleStage ? (
            <Badge variant="secondary" className="capitalize">
              {lead.lifecycleStage}
            </Badge>
          ) : (
            '-'
          ),
      },
    ],
    []
  );

  const handleSort = (key: string) => {
    setFilters((prev) => ({
      ...prev,
      sortBy: key,
      sortOrder: prev.sortBy === key && prev.sortOrder === 'asc' ? 'desc' : 'asc',
    }));
  };

  const handleExport = () => {
    if (data?.leads) {
      const exportData = data.leads.map((lead) => ({
        Name: [lead.firstName, lead.lastName].filter(Boolean).join(' '),
        Email: lead.email,
        Company: lead.company || '',
        'Dormancy Score': Math.round(lead.dormancyScore),
        'Days Dormant': lead.daysDormant,
        'Last Contact': lead.lastContactDate || '',
        'Lifecycle Stage': lead.lifecycleStage || '',
        Rule: lead.matchedRuleName || '',
      }));
      downloadCSV(exportData, `dormant-leads-${new Date().toISOString().split('T')[0]}.csv`);
      toast({ title: 'Export complete', description: 'CSV file has been downloaded.' });
    }
  };

  const handleScan = () => {
    triggerScan.mutate(undefined, {
      onSuccess: () => {
        toast({
          title: 'Scan Started',
          description: 'Dormancy scan triggered. New leads will appear shortly.',
        });
      },
      onError: () => {
        toast({
          title: 'Scan Failed',
          description: 'Failed to trigger scan.',
          variant: 'destructive',
        });
      },
    });
  };

  const handleAddToCampaign = (lead?: DormantLead) => {
    const leadsToAdd = lead ? [lead.id] : Array.from(selectedKeys);
    if (leadsToAdd.length === 0) {
      toast({ title: 'No leads selected', variant: 'destructive' });
      return;
    }
    // Navigate to create campaign with pre-selected leads
    navigate('/campaigns/new', { state: { selectedLeadIds: leadsToAdd } });
  };

  const handleBulkSelect = () => {
    bulkSelect.mutate(
      {
        ruleId: filters.ruleId,
        minDormancyScore: filters.minDormancyScore,
        limit: 100
      },
      {
        onSuccess: (result) => {
          setSelectedKeys(new Set(result.selectedContactIds));
          toast({
            title: 'Bulk selection complete',
            description: `${result.selectedContactIds.length} leads selected (${result.totalMatched} matched).`,
          });
        },
        onError: () => {
          toast({ title: 'Bulk selection failed', variant: 'destructive' });
        },
      }
    );
  };

  const handleCreateCampaignFromLeads = () => {
    if (selectedKeys.size === 0) {
      toast({ title: 'No leads selected', variant: 'destructive' });
      return;
    }
    setShowCampaignDialog(true);
  };

  const handleConfirmCreateCampaign = () => {
    if (!campaignName.trim()) {
      toast({ title: 'Campaign name required', variant: 'destructive' });
      return;
    }
    createCampaign.mutate(
      {
        leadIds: Array.from(selectedKeys),
        name: campaignName,
        channel: campaignChannel,
        tone: campaignTone,
      },
      {
        onSuccess: (result) => {
          toast({
            title: 'Campaign created',
            description: `${result.name} created with ${result.leadCount} leads.`,
          });
          setShowCampaignDialog(false);
          setCampaignName('');
          setSelectedKeys(new Set());
          navigate(`/campaigns/${result.campaignId}`);
        },
        onError: () => {
          toast({ title: 'Failed to create campaign', variant: 'destructive' });
        },
      }
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dormant Leads"
        description={`${formatNumber(data?.total || 0)} leads detected as dormant`}
        actions={
          <div className="flex items-center gap-2">
            {selectedKeys.size > 0 && (
              <Button onClick={handleCreateCampaignFromLeads}>
                <Rocket className="mr-2 h-4 w-4" />
                Create Campaign ({selectedKeys.size})
              </Button>
            )}
            <Button
              variant="outline"
              onClick={handleBulkSelect}
              disabled={bulkSelect.isPending}
            >
              <Wand2 className="mr-2 h-4 w-4" />
              {bulkSelect.isPending ? 'Selecting...' : 'Auto-Select'}
            </Button>
            <Button variant="outline" onClick={handleExport} disabled={!data?.leads?.length}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            <Button variant="outline" onClick={handleScan} disabled={triggerScan.isPending}>
              <RefreshCw className={cn('mr-2 h-4 w-4', triggerScan.isPending && 'animate-spin')} />
              Scan
            </Button>
          </div>
        }
      />

      <LeadsFilters filters={filters} onFiltersChange={setFilters} />

      <DataTable
        columns={columns}
        data={filteredLeads}
        keyExtractor={(lead) => lead.id}
        isLoading={isLoading}
        emptyTitle="No dormant leads found"
        emptyDescription="Run a dormancy scan or adjust your filters to find leads."
        selectable
        selectedKeys={selectedKeys}
        onSelectionChange={setSelectedKeys}
        sortKey={filters.sortBy}
        sortDirection={filters.sortOrder || null}
        onSort={handleSort}
        onRowClick={(lead) => setSelectedLead(lead)}
      />

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(filters.page! - 1) * filters.limit! + 1} -{' '}
            {Math.min(filters.page! * filters.limit!, data.total)} of {data.total}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={filters.page === 1}
              onClick={() => setFilters((prev) => ({ ...prev, page: (prev.page || 1) - 1 }))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={filters.page === data.totalPages}
              onClick={() => setFilters((prev) => ({ ...prev, page: (prev.page || 1) + 1 }))}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <LeadDetailDrawer
        lead={selectedLead}
        open={!!selectedLead}
        onClose={() => setSelectedLead(null)}
        onAddToCampaign={handleAddToCampaign}
      />

      {/* Quick Campaign Creation Dialog */}
      <Dialog open={showCampaignDialog} onOpenChange={setShowCampaignDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Campaign from Selected Leads</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="campaign-name">Campaign Name</Label>
              <Input
                id="campaign-name"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="e.g., Q1 Dormant Lead Reactivation"
              />
            </div>
            <div className="space-y-2">
              <Label>Channel</Label>
              <Select value={campaignChannel} onValueChange={(v) => setCampaignChannel(v as 'email' | 'sms' | 'both')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tone</Label>
              <Select value={campaignTone} onValueChange={(v) => setCampaignTone(v as 'professional' | 'friendly' | 'casual')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="friendly">Friendly</SelectItem>
                  <SelectItem value="casual">Casual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-sm text-muted-foreground">
              {selectedKeys.size} leads will be added to this campaign
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCampaignDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmCreateCampaign} disabled={createCampaign.isPending}>
              {createCampaign.isPending ? 'Creating...' : 'Create Campaign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
