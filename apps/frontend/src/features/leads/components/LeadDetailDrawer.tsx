import { DormantLead } from '@/api/endpoints/leads';
import { useLeadActivity } from '@/api/hooks/useLeads';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate, formatDateTime } from '@/lib/utils';
import { Mail, Phone, Building, ExternalLink, Clock } from 'lucide-react';
import { useAuth } from '@/features/auth/context/AuthContext';

interface LeadDetailDrawerProps {
  lead: DormantLead | null;
  open: boolean;
  onClose: () => void;
  onAddToCampaign?: (lead: DormantLead) => void;
}

export function LeadDetailDrawer({ lead, open, onClose, onAddToCampaign }: LeadDetailDrawerProps) {
  const { portalId } = useAuth();
  const { data: activity, isLoading: isActivityLoading } = useLeadActivity(lead?.id || '');

  if (!lead) return null;

  const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(' ') || 'Unknown';

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>{fullName}</span>
            <Button variant="outline" size="sm" asChild>
              <a
                href={`https://app.hubspot.com/contacts/${portalId}/contact/${lead.hubspotContactId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open in HubSpot
                <ExternalLink className="ml-1 h-3 w-3" />
              </a>
            </Button>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-6 pr-4">
            {/* Contact Info */}
            <div className="space-y-3">
              {lead.email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <a href={`mailto:${lead.email}`} className="hover:underline">
                    {lead.email}
                  </a>
                </div>
              )}
              {lead.phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{lead.phone}</span>
                </div>
              )}
              {lead.company && (
                <div className="flex items-center gap-2 text-sm">
                  <Building className="h-4 w-4 text-muted-foreground" />
                  <span>{lead.company}</span>
                </div>
              )}
            </div>

            <Separator />

            {/* Dormancy Info */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium">Dormancy Details</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Dormancy Score</p>
                  <p className="text-lg font-semibold">{lead.dormancyScore}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Days Dormant</p>
                  <p className="text-lg font-semibold">{lead.daysDormant}</p>
                </div>
                {lead.lastContactDate && (
                  <div>
                    <p className="text-xs text-muted-foreground">Last Contact</p>
                    <p className="text-sm">{formatDate(lead.lastContactDate)}</p>
                  </div>
                )}
                {lead.matchedRuleName && (
                  <div>
                    <p className="text-xs text-muted-foreground">Matched Rule</p>
                    <Badge variant="secondary">{lead.matchedRuleName}</Badge>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Lead Info */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium">Lead Information</h4>
              <div className="grid grid-cols-2 gap-4">
                {lead.lifecycleStage && (
                  <div>
                    <p className="text-xs text-muted-foreground">Lifecycle Stage</p>
                    <Badge variant="outline" className="capitalize">
                      {lead.lifecycleStage}
                    </Badge>
                  </div>
                )}
                {lead.leadScore !== undefined && (
                  <div>
                    <p className="text-xs text-muted-foreground">Lead Score</p>
                    <p className="text-sm font-medium">{lead.leadScore}</p>
                  </div>
                )}
                {lead.owner && (
                  <div>
                    <p className="text-xs text-muted-foreground">Owner</p>
                    <p className="text-sm">{lead.owner}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground">Detected</p>
                  <p className="text-sm">{formatDate(lead.createdAt)}</p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Activity */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium">Recent Activity</h4>
              {isActivityLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : activity && activity.length > 0 ? (
                <div className="space-y-2">
                  {activity.slice(0, 5).map((item, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-3 rounded-lg border p-2 text-sm"
                    >
                      <Clock className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium capitalize">{item.type.replace('_', ' ')}</p>
                        <p className="text-xs text-muted-foreground truncate">{item.details}</p>
                      </div>
                      <time className="text-xs text-muted-foreground">
                        {formatDateTime(item.date)}
                      </time>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No activity recorded</p>
              )}
            </div>
          </div>
        </ScrollArea>

        {/* Actions */}
        <div className="flex gap-2 pt-4">
          <Button className="flex-1" onClick={() => lead && onAddToCampaign?.(lead)}>
            Add to Campaign
          </Button>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
