import { useState, useMemo, useCallback } from 'react';
import {
  useReviews,
  useReviewStats,
  useApproveReview,
  useRejectReview,
  useEditReview,
  useBulkReviewAction,
  useRegenerateMessage,
  useAutoApprove,
} from '@/api/hooks/useReviews';

// Regex to detect placeholders like {{name}}, [name], {name}, <name>
const PLACEHOLDER_REGEX = /(\{\{[\w\s]+\}\}|\[[\w\s]+\]|\{[\w\s]+\}|<[\w\s]+>)/g;

function extractPlaceholders(text: string): string[] {
  const matches = text.match(PLACEHOLDER_REGEX);
  return matches ? [...new Set(matches)] : [];
}

function highlightPlaceholders(text: string): React.ReactNode {
  const parts = text.split(PLACEHOLDER_REGEX);
  return parts.map((part, i) => {
    if (PLACEHOLDER_REGEX.test(part)) {
      return (
        <span key={i} className="bg-yellow-200 text-yellow-800 px-1 rounded font-medium">
          {part}
        </span>
      );
    }
    return part;
  });
}
import { ReviewItem, ReviewsListParams } from '@/api/endpoints/reviews';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState } from '@/components/common/EmptyState';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Check,
  X,
  Pencil,
  MessageCircle,
  Clock,
  CheckCircle,
  XCircle,
  RefreshCw,
  Wand2,
} from 'lucide-react';
import { formatDateTime, truncate } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

function ReviewCard({
  review,
  isSelected,
  onSelect,
  onApprove,
  onReject,
  onEdit,
  onRegenerate,
  isRegenerating,
}: {
  review: ReviewItem;
  isSelected: boolean;
  onSelect: () => void;
  onApprove: () => void;
  onReject: () => void;
  onEdit: () => void;
  onRegenerate: () => void;
  isRegenerating: boolean;
}) {
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <Checkbox checked={isSelected} onCheckedChange={onSelect} className="mt-1" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-medium">{review.contactName}</CardTitle>
              <Badge variant="outline" className="capitalize">
                {review.channel}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{review.contactEmail}</p>
          </div>
          <Badge
            variant={
              review.status === 'approved'
                ? 'success'
                : review.status === 'rejected'
                ? 'destructive'
                : 'secondary'
            }
            className="capitalize"
          >
            {review.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg bg-muted/50 p-3">
          {review.subject && (
            <p className="text-xs font-medium text-muted-foreground mb-1">
              Subject: {highlightPlaceholders(review.subject)}
            </p>
          )}
          <p className="text-sm whitespace-pre-wrap">{highlightPlaceholders(truncate(review.body, 200))}</p>
          {extractPlaceholders(review.body).length > 0 && (
            <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
              <span className="inline-block w-2 h-2 bg-yellow-400 rounded-full"></span>
              Contains {extractPlaceholders(review.body).length} placeholder(s) - Edit to fill in
            </p>
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDateTime(review.createdAt)}
          </div>
          <div>Campaign: {review.campaignName}</div>
        </div>

        {review.status === 'pending' && (
          <div className="flex flex-wrap gap-2 pt-2 border-t">
            <Button size="sm" className="flex-1" onClick={onApprove}>
              <Check className="mr-1 h-4 w-4" />
              Approve
            </Button>
            <Button size="sm" variant="outline" onClick={onEdit}>
              <Pencil className="mr-1 h-4 w-4" />
              Edit
            </Button>
            <Button size="sm" variant="outline" onClick={onRegenerate} disabled={isRegenerating}>
              <RefreshCw className={`mr-1 h-4 w-4 ${isRegenerating ? 'animate-spin' : ''}`} />
              {isRegenerating ? 'Regenerating...' : 'Regenerate'}
            </Button>
            <Button size="sm" variant="destructive" onClick={onReject}>
              <X className="mr-1 h-4 w-4" />
              Reject
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ReviewQueuePage() {
  const { toast } = useToast();
  const [filters, setFilters] = useState<ReviewsListParams>({
    page: 1,
    limit: 12,
    status: 'pending',
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingReview, setEditingReview] = useState<ReviewItem | null>(null);
  const [editedSubject, setEditedSubject] = useState('');
  const [editedBody, setEditedBody] = useState('');
  const [placeholderValues, setPlaceholderValues] = useState<Record<string, string>>({});

  const { data, isLoading } = useReviews(filters);

  // Detect placeholders in the current editing content
  const detectedPlaceholders = useMemo(() => {
    const subjectPlaceholders = extractPlaceholders(editedSubject);
    const bodyPlaceholders = extractPlaceholders(editedBody);
    return [...new Set([...subjectPlaceholders, ...bodyPlaceholders])];
  }, [editedSubject, editedBody]);

  // Apply placeholder replacements
  const applyPlaceholderReplacements = useCallback(() => {
    let newSubject = editedSubject;
    let newBody = editedBody;

    Object.entries(placeholderValues).forEach(([placeholder, value]) => {
      if (value.trim()) {
        const escapedPlaceholder = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escapedPlaceholder, 'g');
        newSubject = newSubject.replace(regex, value);
        newBody = newBody.replace(regex, value);
      }
    });

    setEditedSubject(newSubject);
    setEditedBody(newBody);
    setPlaceholderValues({});
    toast({ title: 'Placeholders replaced' });
  }, [editedSubject, editedBody, placeholderValues, toast]);
  const { data: stats } = useReviewStats();
  const approveReview = useApproveReview();
  const rejectReview = useRejectReview();
  const editReview = useEditReview();
  const bulkAction = useBulkReviewAction();
  const regenerateMessage = useRegenerateMessage();
  const autoApprove = useAutoApprove();

  const handleApprove = (id: string) => {
    approveReview.mutate(
      { id },
      {
        onSuccess: () => toast({ title: 'Message approved' }),
        onError: () => toast({ title: 'Failed to approve', variant: 'destructive' }),
      }
    );
  };

  const handleReject = (id: string) => {
    rejectReview.mutate(
      { id },
      {
        onSuccess: () => toast({ title: 'Message rejected' }),
        onError: () => toast({ title: 'Failed to reject', variant: 'destructive' }),
      }
    );
  };

  const handleEdit = (review: ReviewItem) => {
    setEditingReview(review);
    setEditedSubject(review.editedSubject || review.subject || '');
    setEditedBody(review.editedBody || review.body);
    setPlaceholderValues({});
  };

  const handleSaveEdit = () => {
    if (!editingReview) return;
    editReview.mutate(
      {
        id: editingReview.id,
        subject: editedSubject || undefined,
        body: editedBody,
      },
      {
        onSuccess: () => {
          toast({ title: 'Message edited and approved' });
          setEditingReview(null);
        },
        onError: () => toast({ title: 'Failed to save', variant: 'destructive' }),
      }
    );
  };

  const handleBulkAction = (action: 'approve' | 'reject') => {
    if (selectedIds.size === 0) return;
    bulkAction.mutate(
      { ids: Array.from(selectedIds), action },
      {
        onSuccess: (result) => {
          toast({
            title: `Bulk ${action} complete`,
            description: `${result.processed} messages processed.`,
          });
          setSelectedIds(new Set());
        },
        onError: () => toast({ title: 'Bulk action failed', variant: 'destructive' }),
      }
    );
  };

  const handleRegenerate = (id: string) => {
    regenerateMessage.mutate(
      { id },
      {
        onSuccess: () => toast({ title: 'Message regenerated' }),
        onError: () => toast({ title: 'Failed to regenerate', variant: 'destructive' }),
      }
    );
  };

  const handleAutoApprove = () => {
    autoApprove.mutate(
      { minConfidence: 0.8 },
      {
        onSuccess: (result) => {
          toast({
            title: 'Auto-approve complete',
            description: `${result.approved} messages approved, ${result.skipped} skipped.`,
          });
        },
        onError: () => toast({ title: 'Auto-approve failed', variant: 'destructive' }),
      }
    );
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    if (data?.reviews) {
      const allPendingIds = data.reviews
        .filter((r) => r.status === 'pending')
        .map((r) => r.id);
      setSelectedIds(
        selectedIds.size === allPendingIds.length ? new Set() : new Set(allPendingIds)
      );
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Review Queue"
        description="Review and approve AI-generated messages before sending"
        actions={
          stats && stats.pending > 0 && (
            <Button
              variant="outline"
              onClick={handleAutoApprove}
              disabled={autoApprove.isPending}
            >
              <Wand2 className="mr-2 h-4 w-4" />
              {autoApprove.isPending ? 'Processing...' : 'Auto-Approve'}
            </Button>
          )
        }
      />

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-100">
                <Clock className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.pending || 0}</p>
                <p className="text-xs text-muted-foreground">Pending</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.approved || 0}</p>
                <p className="text-xs text-muted-foreground">Approved</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
                <Pencil className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.edited || 0}</p>
                <p className="text-xs text-muted-foreground">Edited</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
                <XCircle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.rejected || 0}</p>
                <p className="text-xs text-muted-foreground">Rejected</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Bulk Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Tabs
            value={filters.status || 'pending'}
            onValueChange={(value) =>
              setFilters((prev) => ({
                ...prev,
                status: value === 'all' ? undefined : (value as ReviewsListParams['status']),
                page: 1,
              }))
            }
          >
            <TabsList>
              <TabsTrigger value="pending">Pending</TabsTrigger>
              <TabsTrigger value="approved">Approved</TabsTrigger>
              <TabsTrigger value="rejected">Rejected</TabsTrigger>
              <TabsTrigger value="all">All</TabsTrigger>
            </TabsList>
          </Tabs>

          <Select
            value={filters.channel || 'all'}
            onValueChange={(value) =>
              setFilters((prev) => ({
                ...prev,
                channel: value === 'all' ? undefined : (value as 'email' | 'sms'),
              }))
            }
          >
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Channel" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {selectedIds.size > 0 && filters.status === 'pending' && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{selectedIds.size} selected</span>
            <Button size="sm" onClick={() => handleBulkAction('approve')}>
              <Check className="mr-1 h-4 w-4" />
              Approve All
            </Button>
            <Button size="sm" variant="destructive" onClick={() => handleBulkAction('reject')}>
              <X className="mr-1 h-4 w-4" />
              Reject All
            </Button>
          </div>
        )}

        {filters.status === 'pending' && data?.reviews && data.reviews.length > 0 && (
          <Button variant="outline" size="sm" onClick={selectAll}>
            {selectedIds.size === data.reviews.filter((r) => r.status === 'pending').length
              ? 'Deselect All'
              : 'Select All'}
          </Button>
        )}
      </div>

      {/* Review Cards */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : data?.reviews && data.reviews.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.reviews.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              isSelected={selectedIds.has(review.id)}
              onSelect={() => toggleSelection(review.id)}
              onApprove={() => handleApprove(review.id)}
              onReject={() => handleReject(review.id)}
              onEdit={() => handleEdit(review)}
              onRegenerate={() => handleRegenerate(review.id)}
              isRegenerating={regenerateMessage.isPending && regenerateMessage.variables?.id === review.id}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={MessageCircle}
          title="No messages to review"
          description={
            filters.status === 'pending'
              ? 'All messages have been reviewed. Great job!'
              : 'No messages match the current filters.'
          }
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

      {/* Edit Dialog */}
      <Dialog open={!!editingReview} onOpenChange={() => setEditingReview(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Message</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">To:</span>
              <span className="font-medium">{editingReview?.contactName}</span>
              <span className="text-muted-foreground">({editingReview?.contactEmail})</span>
            </div>

            {/* Placeholder Helper */}
            {detectedPlaceholders.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-2 h-2 bg-yellow-400 rounded-full"></span>
                  <span className="text-sm font-medium text-amber-800">
                    {detectedPlaceholders.length} Placeholder(s) Detected
                  </span>
                </div>
                <p className="text-xs text-amber-700">
                  Fill in the values below and click "Apply" to replace placeholders in the message.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {detectedPlaceholders.map((placeholder) => (
                    <div key={placeholder} className="space-y-1">
                      <Label className="text-xs text-amber-800">{placeholder}</Label>
                      <Input
                        placeholder={`Enter value for ${placeholder}`}
                        value={placeholderValues[placeholder] || ''}
                        onChange={(e) =>
                          setPlaceholderValues((prev) => ({
                            ...prev,
                            [placeholder]: e.target.value,
                          }))
                        }
                        className="h-8 text-sm"
                      />
                    </div>
                  ))}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={applyPlaceholderReplacements}
                  disabled={Object.values(placeholderValues).every((v) => !v.trim())}
                  className="w-full"
                >
                  Apply Replacements
                </Button>
              </div>
            )}

            {editingReview?.channel === 'email' && (
              <div className="space-y-2">
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  value={editedSubject}
                  onChange={(e) => setEditedSubject(e.target.value)}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="body">Message</Label>
              <Textarea
                id="body"
                value={editedBody}
                onChange={(e) => setEditedBody(e.target.value)}
                rows={10}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                You can also edit the text directly. Placeholders are highlighted in yellow.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingReview(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={!editedBody.trim()}>
              Save & Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
