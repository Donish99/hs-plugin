import { useState } from 'react';
import { OutreachRecord } from '@/api/endpoints/campaigns';
import {
  useCampaignOutreach,
  useGenerateMessages,
  useApproveOutreach,
  useApproveAllOutreach,
  useSendApproved,
} from '@/api/hooks/useCampaigns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { useToast } from '@/hooks/use-toast';
import {
  Wand2,
  Check,
  CheckCheck,
  Send,
  Mail,
  MessageSquare,
  FileText,
  Loader2,
} from 'lucide-react';

interface MessageReviewPanelProps {
  campaignId: string;
}

export function MessageReviewPanel({ campaignId }: MessageReviewPanelProps) {
  const { toast } = useToast();
  const [selectedRecords, setSelectedRecords] = useState<Set<string>>(new Set());
  const [previewRecord, setPreviewRecord] = useState<OutreachRecord | null>(null);

  const { data: outreachData, isLoading } = useCampaignOutreach(campaignId);
  const generateMessages = useGenerateMessages();
  const approveOutreach = useApproveOutreach();
  const approveAllOutreach = useApproveAllOutreach();
  const sendApproved = useSendApproved();

  const records = outreachData?.records || [];

  // Filter records by status
  const pendingRecords = records.filter((r) => r.status === 'pending');
  const approvedRecords = records.filter((r) => r.status === 'approved');
  const generatedRecords = pendingRecords.filter((r) => r.subject && r.bodyText);
  const ungeneratedRecords = pendingRecords.filter((r) => !r.subject || !r.bodyText);

  const handleGenerateMessages = () => {
    generateMessages.mutate(campaignId, {
      onSuccess: (data) => {
        toast({
          title: 'Messages queued for generation',
          description: `${data.generatedCount} messages will be generated`,
        });
      },
      onError: () => {
        toast({
          title: 'Failed to generate messages',
          variant: 'destructive',
        });
      },
    });
  };

  const handleApproveRecord = (recordId: string) => {
    approveOutreach.mutate(
      { campaignId, recordId },
      {
        onSuccess: () => {
          toast({ title: 'Message approved' });
        },
        onError: () => {
          toast({ title: 'Failed to approve', variant: 'destructive' });
        },
      }
    );
  };

  const handleApproveAll = () => {
    approveAllOutreach.mutate(campaignId, {
      onSuccess: (data) => {
        toast({
          title: 'Messages approved',
          description: `${data.approvedCount} approved, ${data.skippedCount} skipped`,
        });
      },
      onError: () => {
        toast({ title: 'Failed to approve', variant: 'destructive' });
      },
    });
  };

  const handleSendApproved = () => {
    sendApproved.mutate(campaignId, {
      onSuccess: (data) => {
        toast({
          title: 'Messages queued for sending',
          description: `${data.queuedCount} messages will be sent`,
        });
      },
      onError: () => {
        toast({ title: 'Failed to send', variant: 'destructive' });
      },
    });
  };

  const toggleSelection = (recordId: string) => {
    setSelectedRecords((prev) => {
      const next = new Set(prev);
      if (next.has(recordId)) {
        next.delete(recordId);
      } else {
        next.add(recordId);
      }
      return next;
    });
  };

  const selectAll = () => {
    const allIds = generatedRecords.map((r) => r.id);
    setSelectedRecords(new Set(allIds));
  };

  const deselectAll = () => {
    setSelectedRecords(new Set());
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-12">
          <LoadingSpinner />
        </CardContent>
      </Card>
    );
  }

  // Show empty state if no records
  if (records.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Mail className="h-12 w-12 text-muted-foreground mb-3" />
          <p className="text-lg font-medium">No messages to review</p>
          <p className="text-sm text-muted-foreground mt-1">
            Create a campaign with leads to generate messages
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Action Bar */}
      <Card>
        <CardContent className="flex items-center justify-between pt-6">
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-yellow-500" />
              <span>{ungeneratedRecords.length} awaiting generation</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-blue-500" />
              <span>{generatedRecords.length} ready for review</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-green-500" />
              <span>{approvedRecords.length} approved</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {ungeneratedRecords.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleGenerateMessages}
                disabled={generateMessages.isPending}
              >
                {generateMessages.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4 mr-2" />
                )}
                Generate Messages
              </Button>
            )}
            {generatedRecords.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleApproveAll}
                disabled={approveAllOutreach.isPending}
              >
                {approveAllOutreach.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCheck className="h-4 w-4 mr-2" />
                )}
                Approve All ({generatedRecords.length})
              </Button>
            )}
            {approvedRecords.length > 0 && (
              <Button
                size="sm"
                onClick={handleSendApproved}
                disabled={sendApproved.isPending}
              >
                {sendApproved.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Send Approved ({approvedRecords.length})
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Messages List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Messages for Review</CardTitle>
          {generatedRecords.length > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <Button variant="link" size="sm" onClick={selectAll}>
                Select All
              </Button>
              <Button variant="link" size="sm" onClick={deselectAll}>
                Deselect All
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {records.map((record) => {
              const hasContent = record.subject && record.bodyText;
              const isApproved = record.status === 'approved';
              const isSent = record.status === 'sent' || record.status === 'delivered';

              return (
                <div
                  key={record.id}
                  className={`flex items-start gap-4 rounded-lg border p-4 ${
                    isApproved
                      ? 'border-green-200 bg-green-50'
                      : isSent
                      ? 'border-blue-200 bg-blue-50'
                      : hasContent
                      ? 'border-border'
                      : 'border-dashed border-muted-foreground/30 bg-muted/30'
                  }`}
                >
                  {hasContent && !isApproved && !isSent && (
                    <Checkbox
                      checked={selectedRecords.has(record.id)}
                      onCheckedChange={() => toggleSelection(record.id)}
                    />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {record.channel === 'email' ? (
                        <Mail className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <MessageSquare className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="font-medium">
                        {record.contactName || 'Unknown'}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {record.contactEmail}
                      </span>
                      <Badge
                        variant={
                          isApproved
                            ? 'success'
                            : isSent
                            ? 'default'
                            : hasContent
                            ? 'secondary'
                            : 'outline'
                        }
                        className="capitalize ml-auto"
                      >
                        {isSent
                          ? 'Sent'
                          : isApproved
                          ? 'Approved'
                          : hasContent
                          ? 'Ready'
                          : 'Generating...'}
                      </Badge>
                    </div>

                    {hasContent ? (
                      <>
                        <p className="text-sm font-medium truncate">
                          {record.subject}
                        </p>
                        <p className="text-sm text-muted-foreground truncate mt-1">
                          {record.bodyText?.slice(0, 100)}...
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">
                        Message content will be generated when you click "Generate Messages"
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {hasContent && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPreviewRecord(record)}
                      >
                        <FileText className="h-4 w-4" />
                      </Button>
                    )}
                    {hasContent && !isApproved && !isSent && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleApproveRecord(record.id)}
                        disabled={approveOutreach.isPending}
                      >
                        {approveOutreach.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Preview Modal */}
      <Dialog open={!!previewRecord} onOpenChange={() => setPreviewRecord(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {previewRecord?.channel === 'email' ? (
                <Mail className="h-5 w-5" />
              ) : (
                <MessageSquare className="h-5 w-5" />
              )}
              Message Preview
            </DialogTitle>
          </DialogHeader>
          {previewRecord && (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-4">
                {/* Recipient Info */}
                <div className="grid gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-20">To:</span>
                    <span className="font-medium">
                      {previewRecord.contactName || 'Unknown'}{' '}
                      {previewRecord.contactEmail && `<${previewRecord.contactEmail}>`}
                    </span>
                  </div>
                  {previewRecord.companyName && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground w-20">Company:</span>
                      <span>{previewRecord.companyName}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-20">Status:</span>
                    <Badge
                      variant={
                        previewRecord.status === 'approved'
                          ? 'success'
                          : 'secondary'
                      }
                      className="capitalize"
                    >
                      {previewRecord.status}
                    </Badge>
                  </div>
                </div>

                {/* Subject */}
                {previewRecord.channel === 'email' && previewRecord.subject && (
                  <div className="border-t pt-4">
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">
                      Subject
                    </h4>
                    <p className="font-medium">{previewRecord.subject}</p>
                  </div>
                )}

                {/* Message Body */}
                <div className="border-t pt-4">
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">
                    {previewRecord.channel === 'email' ? 'Email Body' : 'Message'}
                  </h4>
                  {previewRecord.bodyHtml ? (
                    <div
                      className="prose prose-sm max-w-none rounded-lg border bg-muted/30 p-4"
                      dangerouslySetInnerHTML={{ __html: previewRecord.bodyHtml }}
                    />
                  ) : previewRecord.bodyText ? (
                    <div className="rounded-lg border bg-muted/30 p-4 whitespace-pre-wrap text-sm">
                      {previewRecord.bodyText}
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
          <DialogFooter>
            {previewRecord && previewRecord.status === 'pending' && (
              <Button
                onClick={() => {
                  handleApproveRecord(previewRecord.id);
                  setPreviewRecord(null);
                }}
              >
                <Check className="h-4 w-4 mr-2" />
                Approve Message
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
