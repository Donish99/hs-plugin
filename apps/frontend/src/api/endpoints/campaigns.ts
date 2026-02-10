import { apiClient, withAccountId } from '../client';

export type CampaignStatus = 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'failed';
export type CampaignChannel = 'email' | 'sms' | 'both';

export interface Campaign {
  id: string;
  name: string;
  description?: string;
  status: CampaignStatus;
  channel: CampaignChannel;
  ruleId?: string;
  ruleName?: string;
  targetCount: number;
  sentCount: number;
  deliveredCount: number;
  openCount: number;
  clickCount: number;
  replyCount: number;
  tone: string;
  requiresReview: boolean;
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignProgress {
  total: number;
  pending: number;
  pendingReview: number;
  sent: number;
  failed: number;
  generating: number;
  percentComplete: number;
}

export interface CampaignDetails extends Campaign {
  leads: Array<{
    id: string;
    email: string;
    name: string;
    status: 'pending' | 'sent' | 'delivered' | 'opened' | 'clicked' | 'replied' | 'failed';
    sentAt?: string;
  }>;
  metrics: {
    openRate: number;
    clickRate: number;
    replyRate: number;
    bounceRate: number;
  };
  progress?: CampaignProgress;
}

export interface CreateCampaignInput {
  name: string;
  description?: string;
  channel: CampaignChannel;
  ruleId?: string;
  leadIds?: string[];
  tone?: 'professional' | 'friendly' | 'casual';
  scheduledAt?: string;
  enableABTest?: boolean;
  requiresReview?: boolean;
}

export interface UpdateCampaignInput {
  name?: string;
  description?: string;
  tone?: string;
  scheduledAt?: string;
}

export interface CampaignsListParams {
  page?: number;
  limit?: number;
  status?: CampaignStatus;
  channel?: CampaignChannel;
}

export type OutreachStatus = 'pending' | 'pending_review' | 'approved' | 'sent' | 'delivered' | 'opened' | 'clicked' | 'replied' | 'bounced' | 'failed';

export interface OutreachRecord {
  id: string;
  campaignId: string;
  hubspotContactId: number;
  contactEmail?: string;
  contactName?: string;
  companyName?: string;
  channel: 'email' | 'sms';
  subject?: string;
  bodyText?: string;
  bodyHtml?: string;
  status: OutreachStatus;
  scheduledAt?: string;
  sentAt?: string;
  openedAt?: string;
  clickedAt?: string;
  repliedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignsListResponse {
  campaigns: Campaign[];
  total: number;
  page: number;
  limit: number;
}

// NOTE: Campaigns controller needs to be implemented in the backend
// Expected path: /api/accounts/:accountId/campaigns
export const campaignsApi = {
  /**
   * Get paginated list of campaigns
   */
  getAll: async (params?: CampaignsListParams): Promise<CampaignsListResponse> => {
    const response = await apiClient.get<CampaignsListResponse>(
      withAccountId('/campaigns'),
      { params }
    );
    return response.data;
  },

  /**
   * Get a single campaign with details
   */
  getById: async (id: string): Promise<CampaignDetails> => {
    const response = await apiClient.get<CampaignDetails>(
      withAccountId(`/campaigns/${id}`)
    );
    return response.data;
  },

  /**
   * Create a new campaign
   */
  create: async (input: CreateCampaignInput): Promise<Campaign> => {
    const response = await apiClient.post<Campaign>(
      withAccountId('/campaigns'),
      input
    );
    return response.data;
  },

  /**
   * Update a campaign
   */
  update: async (id: string, input: UpdateCampaignInput): Promise<Campaign> => {
    const response = await apiClient.patch<Campaign>(
      withAccountId(`/campaigns/${id}`),
      input
    );
    return response.data;
  },

  /**
   * Delete a campaign
   */
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(withAccountId(`/campaigns/${id}`));
  },

  /**
   * Start a campaign
   */
  start: async (id: string): Promise<Campaign> => {
    const response = await apiClient.post<Campaign>(
      withAccountId(`/campaigns/${id}/start`)
    );
    return response.data;
  },

  /**
   * Pause a campaign
   */
  pause: async (id: string): Promise<Campaign> => {
    const response = await apiClient.post<Campaign>(
      withAccountId(`/campaigns/${id}/pause`)
    );
    return response.data;
  },

  /**
   * Resume a paused campaign
   */
  resume: async (id: string): Promise<Campaign> => {
    const response = await apiClient.post<Campaign>(
      withAccountId(`/campaigns/${id}/resume`)
    );
    return response.data;
  },

  /**
   * Add leads to a campaign
   */
  addLeads: async (id: string, leadIds: string[]): Promise<{ added: number }> => {
    const response = await apiClient.post<{ added: number }>(
      withAccountId(`/campaigns/${id}/leads`),
      { leadIds }
    );
    return response.data;
  },

  /**
   * Remove leads from a campaign
   */
  removeLeads: async (id: string, leadIds: string[]): Promise<{ removed: number }> => {
    const response = await apiClient.delete<{ removed: number }>(
      withAccountId(`/campaigns/${id}/leads`),
      { data: { leadIds } }
    );
    return response.data;
  },

  /**
   * Get campaign stats summary
   */
  getStats: async (): Promise<{
    total: number;
    byStatus: Record<CampaignStatus, number>;
    activeCount: number;
  }> => {
    const response = await apiClient.get<{
      total: number;
      byStatus: Record<CampaignStatus, number>;
      activeCount: number;
    }>(withAccountId('/campaigns/stats'));
    return response.data;
  },

  /**
   * Get outreach records (sent messages) for a campaign
   */
  getOutreachRecords: async (campaignId: string, params?: {
    page?: number;
    limit?: number;
    status?: OutreachStatus;
  }): Promise<{
    records: OutreachRecord[];
    total: number;
    page: number;
    limit: number;
  }> => {
    const response = await apiClient.get<{
      records: OutreachRecord[];
      total: number;
      page: number;
      limit: number;
    }>(
      withAccountId(`/campaigns/${campaignId}/outreach`),
      { params }
    );
    return response.data;
  },

  /**
   * Get a single outreach record by ID
   */
  getOutreachRecord: async (campaignId: string, recordId: string): Promise<OutreachRecord> => {
    const response = await apiClient.get<OutreachRecord>(
      withAccountId(`/campaigns/${campaignId}/outreach/${recordId}`)
    );
    return response.data;
  },

  /**
   * Generate AI messages for a campaign without sending
   */
  generateMessages: async (campaignId: string): Promise<{
    success: boolean;
    message: string;
    generatedCount: number;
    alreadyGenerated: number;
  }> => {
    const response = await apiClient.post<{
      success: boolean;
      message: string;
      generatedCount: number;
      alreadyGenerated: number;
    }>(
      withAccountId(`/campaigns/${campaignId}/generate`)
    );
    return response.data;
  },

  /**
   * Approve a single outreach record for sending
   */
  approveOutreach: async (campaignId: string, recordId: string): Promise<{
    success: boolean;
    message: string;
    record: {
      id: string;
      status: OutreachStatus;
      contactEmail?: string;
      contactName?: string;
    };
  }> => {
    const response = await apiClient.post<{
      success: boolean;
      message: string;
      record: {
        id: string;
        status: OutreachStatus;
        contactEmail?: string;
        contactName?: string;
      };
    }>(
      withAccountId(`/campaigns/${campaignId}/outreach/${recordId}/approve`)
    );
    return response.data;
  },

  /**
   * Approve all pending outreach records that have generated content
   */
  approveAllOutreach: async (campaignId: string): Promise<{
    success: boolean;
    message: string;
    approvedCount: number;
    skippedCount: number;
  }> => {
    const response = await apiClient.post<{
      success: boolean;
      message: string;
      approvedCount: number;
      skippedCount: number;
    }>(
      withAccountId(`/campaigns/${campaignId}/outreach/approve-all`)
    );
    return response.data;
  },

  /**
   * Send only approved messages
   */
  sendApproved: async (campaignId: string): Promise<{
    success: boolean;
    message: string;
    queuedCount: number;
  }> => {
    const response = await apiClient.post<{
      success: boolean;
      message: string;
      queuedCount: number;
    }>(
      withAccountId(`/campaigns/${campaignId}/send-approved`)
    );
    return response.data;
  },

  /**
   * Retry a single failed outreach record
   */
  retryOutreach: async (campaignId: string, recordId: string): Promise<{
    success: boolean;
    message: string;
    record: {
      id: string;
      status: OutreachStatus;
      contactEmail?: string;
      contactName?: string;
    };
  }> => {
    const response = await apiClient.post<{
      success: boolean;
      message: string;
      record: {
        id: string;
        status: OutreachStatus;
        contactEmail?: string;
        contactName?: string;
      };
    }>(
      withAccountId(`/campaigns/${campaignId}/outreach/${recordId}/retry`)
    );
    return response.data;
  },

  /**
   * Retry all failed outreach records for a campaign
   */
  retryAllFailed: async (campaignId: string): Promise<{
    success: boolean;
    message: string;
    retriedCount: number;
  }> => {
    const response = await apiClient.post<{
      success: boolean;
      message: string;
      retriedCount: number;
    }>(
      withAccountId(`/campaigns/${campaignId}/retry-failed`)
    );
    return response.data;
  },

  /**
   * Get all failed outreach records for a campaign
   */
  getFailedOutreach: async (campaignId: string): Promise<{
    records: OutreachRecord[];
    total: number;
  }> => {
    const response = await apiClient.get<{
      records: OutreachRecord[];
      total: number;
    }>(
      withAccountId(`/campaigns/${campaignId}/outreach/failed`)
    );
    return response.data;
  },
};
