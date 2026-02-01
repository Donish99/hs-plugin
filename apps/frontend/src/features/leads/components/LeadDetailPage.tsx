import { useParams, useNavigate } from 'react-router-dom';
import { useLead, useLeadActivity } from '@/api/hooks/useLeads';
import { usePreviewMessage } from '@/api/hooks/useGenerate';
import { PageHeader } from '@/components/common/PageHeader';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate, formatDateTime } from '@/lib/utils';
import {
  ArrowLeft,
  Mail,
  Phone,
  Building,
  ExternalLink,
  Clock,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '@/features/auth/context/AuthContext';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

export function LeadDetailPage() {
  const { contactId } = useParams<{ contactId: string }>();
  const navigate = useNavigate();
  const { portalId } = useAuth();
  const { toast } = useToast();

  const { data: lead, isLoading } = useLead(contactId || '');
  const { data: activity, isLoading: isActivityLoading } = useLeadActivity(contactId || '');
  const previewMessage = usePreviewMessage();

  const [generatedEmail, setGeneratedEmail] = useState<{
    subject?: string;
    body: string;
  } | null>(null);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Lead not found</p>
        <Button variant="outline" onClick={() => navigate('/leads')}>
          Back to Leads
        </Button>
      </div>
    );
  }

  const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(' ') || 'Unknown';

  const handleGeneratePreview = async () => {
    try {
      const result = await previewMessage.mutateAsync({
        contactId: lead.id,
        channel: 'email',
        tone: 'professional',
      });
      setGeneratedEmail(result);
    } catch {
      toast({
        title: 'Generation failed',
        description: 'Failed to generate message preview.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={fullName}
        description={lead.email}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate('/leads')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button variant="outline" asChild>
              <a
                href={`https://app.hubspot.com/contacts/${portalId}/contact/${lead.hubspotContactId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open in HubSpot
                <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </Button>
            <Button onClick={() => navigate('/campaigns/new', { state: { selectedLeadIds: [lead.id] } })}>
              Add to Campaign
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Contact Details */}
          <Card>
            <CardHeader>
              <CardTitle>Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {lead.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a href={`mailto:${lead.email}`} className="text-sm hover:underline">
                      {lead.email}
                    </a>
                  </div>
                )}
                {lead.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{lead.phone}</span>
                  </div>
                )}
                {lead.company && (
                  <div className="flex items-center gap-2">
                    <Building className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{lead.company}</span>
                  </div>
                )}
              </div>

              {lead.properties && Object.keys(lead.properties).length > 0 && (
                <>
                  <Separator />
                  <div className="grid gap-3 sm:grid-cols-2">
                    {Object.entries(lead.properties).map(([key, value]) => (
                      <div key={key}>
                        <p className="text-xs text-muted-foreground capitalize">
                          {key.replace(/_/g, ' ')}
                        </p>
                        <p className="text-sm">{value}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* AI Message Preview */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>AI Message Preview</CardTitle>
              <Button
                size="sm"
                onClick={handleGeneratePreview}
                disabled={previewMessage.isPending}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                {previewMessage.isPending ? 'Generating...' : 'Generate'}
              </Button>
            </CardHeader>
            <CardContent>
              {generatedEmail ? (
                <div className="space-y-4">
                  {generatedEmail.subject && (
                    <div>
                      <p className="text-xs text-muted-foreground">Subject</p>
                      <p className="text-sm font-medium">{generatedEmail.subject}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground">Body</p>
                    <div className="mt-1 rounded-lg border bg-muted/50 p-4">
                      <p className="whitespace-pre-wrap text-sm">{generatedEmail.body}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                  Click "Generate" to create a personalized message for this lead
                </div>
              )}
            </CardContent>
          </Card>

          {/* Activity */}
          <Card>
            <CardHeader>
              <CardTitle>Activity Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {isActivityLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : activity && activity.length > 0 ? (
                <div className="space-y-3">
                  {activity.map((item, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-3 rounded-lg border p-3"
                    >
                      <Clock className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium capitalize">
                          {item.type.replace('_', ' ')}
                        </p>
                        <p className="text-xs text-muted-foreground">{item.details}</p>
                      </div>
                      <time className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDateTime(item.date)}
                      </time>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                  No activity recorded
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Dormancy Stats */}
          <Card>
            <CardHeader>
              <CardTitle>Dormancy Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Score</span>
                <Badge
                  variant={
                    lead.dormancyScore >= 80
                      ? 'destructive'
                      : lead.dormancyScore >= 50
                      ? 'warning'
                      : 'secondary'
                  }
                >
                  {lead.dormancyScore}
                </Badge>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Days Dormant</span>
                <span className="text-sm font-medium">{lead.daysDormant}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Last Contact</span>
                <span className="text-sm font-medium">
                  {lead.lastContactDate ? formatDate(lead.lastContactDate) : 'Never'}
                </span>
              </div>
              {lead.matchedRuleName && (
                <>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Matched Rule</span>
                    <Badge variant="outline">{lead.matchedRuleName}</Badge>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Lead Info */}
          <Card>
            <CardHeader>
              <CardTitle>Lead Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {lead.lifecycleStage && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Lifecycle Stage</span>
                  <Badge variant="secondary" className="capitalize">
                    {lead.lifecycleStage}
                  </Badge>
                </div>
              )}
              {lead.leadScore !== undefined && (
                <>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Lead Score</span>
                    <span className="text-sm font-medium">{lead.leadScore}</span>
                  </div>
                </>
              )}
              {lead.owner && (
                <>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Owner</span>
                    <span className="text-sm font-medium">{lead.owner}</span>
                  </div>
                </>
              )}
              <Separator />
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Detected</span>
                <span className="text-sm font-medium">{formatDate(lead.createdAt)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
