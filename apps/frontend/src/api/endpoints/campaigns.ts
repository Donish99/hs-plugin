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
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
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
};
