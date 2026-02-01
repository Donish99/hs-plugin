import { apiClient, withAccountId } from '../client';

export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'edited';

export interface ReviewItem {
  id: string;
  contactId: string;
  contactEmail: string;
  contactName: string;
  campaignId: string;
  campaignName: string;
  channel: 'email' | 'sms';
  subject?: string;
  body: string;
  tone: string;
  status: ReviewStatus;
  editedBody?: string;
  editedSubject?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  createdAt: string;
}

export interface ReviewsListParams {
  page?: number;
  limit?: number;
  status?: ReviewStatus;
  campaignId?: string;
  channel?: 'email' | 'sms';
}

export interface ReviewsListResponse {
  reviews: ReviewItem[];
  count: number;
  total: number;
  page: number;
  limit: number;
  pending: number;
}

export interface ApproveInput {
  id: string;
}

export interface RejectInput {
  id: string;
  reason?: string;
}

export interface EditInput {
  id: string;
  subject?: string;
  body: string;
}

export interface BulkActionInput {
  ids: string[];
  action: 'approve' | 'reject';
  reason?: string;
}

export const reviewsApi = {
  /**
   * Get paginated list of review items
   */
  getAll: async (params?: ReviewsListParams): Promise<ReviewsListResponse> => {
    const response = await apiClient.get<{ reviews: ReviewItem[]; count: number }>(
      withAccountId('/reviews'),
      { params }
    );
    return {
      reviews: response.data.reviews,
      count: response.data.count,
      total: response.data.count,
      page: params?.page || 1,
      limit: params?.limit || 20,
      pending: response.data.reviews.filter(r => r.status === 'pending').length,
    };
  },

  /**
   * Get a single review item
   */
  getById: async (id: string): Promise<ReviewItem> => {
    const response = await apiClient.get<ReviewItem>(withAccountId(`/reviews/${id}`));
    return response.data;
  },

  /**
   * Approve a message
   */
  approve: async (input: ApproveInput): Promise<ReviewItem> => {
    const response = await apiClient.post<ReviewItem>(
      withAccountId(`/reviews/${input.id}/approve`)
    );
    return response.data;
  },

  /**
   * Reject a message
   */
  reject: async (input: RejectInput): Promise<ReviewItem> => {
    const response = await apiClient.post<ReviewItem>(
      withAccountId(`/reviews/${input.id}/reject`),
      { reason: input.reason }
    );
    return response.data;
  },

  /**
   * Edit and approve a message
   */
  edit: async (input: EditInput): Promise<ReviewItem> => {
    const response = await apiClient.post<ReviewItem>(
      withAccountId(`/reviews/${input.id}/edit`),
      { subject: input.subject, body: input.body }
    );
    return response.data;
  },

  /**
   * Bulk approve or reject messages
   */
  bulkAction: async (input: BulkActionInput): Promise<{ processed: number; failed: number }> => {
    const endpoint = input.action === 'approve'
      ? '/reviews/bulk/approve'
      : '/reviews/bulk/reject';
    const response = await apiClient.post<{ processed: number; failed: number }>(
      withAccountId(endpoint),
      { reviewIds: input.ids, reason: input.reason }
    );
    return response.data;
  },

  /**
   * Get review queue stats
   */
  getStats: async (): Promise<{
    pending: number;
    approved: number;
    rejected: number;
    edited: number;
  }> => {
    const response = await apiClient.get<{
      pending: number;
      approved: number;
      rejected: number;
      edited: number;
    }>(withAccountId('/reviews/stats/summary'));
    return response.data;
  },

  /**
   * Regenerate a message
   */
  regenerate: async (id: string, options?: { tone?: string }): Promise<{
    success: boolean;
    variantId: string;
    newBody: string;
    newSubject?: string;
  }> => {
    const response = await apiClient.post(
      withAccountId(`/reviews/${id}/regenerate`),
      options
    );
    return response.data;
  },

  /**
   * Auto-approve messages based on rules
   */
  autoApprove: async (options?: {
    minConfidence?: number;
    ruleIds?: string[];
  }): Promise<{
    approved: number;
    skipped: number;
    errors: number;
  }> => {
    const response = await apiClient.post(
      withAccountId('/reviews/auto-approve'),
      options
    );
    return response.data;
  },

  /**
   * Queue a message for review
   */
  queueForReview: async (input: {
    contactId: string;
    campaignId: string;
    channel: 'email' | 'sms';
    subject?: string;
    body: string;
    tone: string;
  }): Promise<ReviewItem> => {
    const response = await apiClient.post<ReviewItem>(
      withAccountId('/reviews/queue'),
      input
    );
    return response.data;
  },
};
