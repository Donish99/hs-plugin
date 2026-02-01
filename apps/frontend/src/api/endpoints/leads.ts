import { apiClient, withAccountId } from '../client';

export interface DormantLead {
  id: string;
  hubspotContactId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  phone?: string;
  lastContactDate?: string;
  daysDormant: number;
  dormancyScore: number;
  leadScore?: number;
  matchedRuleId?: string;
  matchedRuleName?: string;
  lifecycleStage?: string;
  owner?: string;
  createdAt: string;
  properties?: Record<string, string>;
}

export interface LeadsListParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  ruleId?: string;
  minDormancyScore?: number;
  maxDormancyScore?: number;
  search?: string;
}

export interface LeadsListResponse {
  contacts: DormantLead[];
  leads: DormantLead[];  // Alias for contacts for backward compatibility
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface LeadStats {
  totalDormant: number;
  avgDormancyDays: number;
  byRule: Array<{ ruleId: string; ruleName: string; count: number }>;
  byLifecycleStage: Array<{ stage: string; count: number }>;
}

export const leadsApi = {
  /**
   * Get paginated list of dormant leads
   */
  getAll: async (params?: LeadsListParams): Promise<LeadsListResponse> => {
    const response = await apiClient.get<{ contacts: DormantLead[]; total: number; page: number; limit: number; totalPages: number }>(
      withAccountId('/dormant-leads'),
      { params }
    );
    // Map backend response to frontend interface with both contacts and leads
    return {
      ...response.data,
      leads: response.data.contacts,
    };
  },

  /**
   * Get a single lead by ID
   */
  getById: async (id: string): Promise<DormantLead> => {
    const response = await apiClient.get<{ contact: DormantLead }>(
      withAccountId(`/dormant-leads/${id}`)
    );
    return response.data.contact;
  },

  /**
   * Get lead statistics
   */
  getStats: async (): Promise<LeadStats> => {
    // This endpoint might need to be added to backend
    // For now, derive from list response
    const response = await apiClient.get<LeadsListResponse>(
      withAccountId('/dormant-leads'),
      { params: { limit: 1 } }
    );
    return {
      totalDormant: response.data.total,
      avgDormancyDays: 0,
      byRule: [],
      byLifecycleStage: [],
    };
  },

  /**
   * Trigger a dormancy scan
   */
  triggerScan: async (): Promise<{ jobId: string; message: string }> => {
    // This endpoint might need to be added to backend
    return { jobId: 'pending', message: 'Scan triggered' };
  },

  /**
   * Export leads to CSV
   */
  export: async (params?: LeadsListParams): Promise<Blob> => {
    const response = await apiClient.get(
      withAccountId('/dormant-leads/export/csv'),
      {
        params,
        responseType: 'blob',
      }
    );
    return response.data;
  },

  /**
   * Get lead activity history
   */
  getActivity: async (
    _id: string
  ): Promise<Array<{ type: string; date: string; details: string }>> => {
    // This endpoint might need to be added to backend
    return [];
  },

  /**
   * Get dormancy report by rule
   */
  getReportByRule: async (ruleId: string): Promise<{
    ruleId: string;
    ruleName: string;
    totalLeads: number;
    avgDormancyDays: number;
    scoreDistribution: Array<{ range: string; count: number }>;
    topLeads: DormantLead[];
  }> => {
    const response = await apiClient.get(
      withAccountId(`/dormant-leads/report/${ruleId}`)
    );
    return response.data;
  },

  /**
   * Create campaign from selected leads
   */
  createCampaignFromLeads: async (input: {
    leadIds: string[];
    name: string;
    channel: 'email' | 'sms' | 'both';
    tone?: 'professional' | 'friendly' | 'casual';
    scheduledAt?: string;
  }): Promise<{
    campaignId: string;
    name: string;
    leadCount: number;
  }> => {
    const response = await apiClient.post(
      withAccountId('/dormant-leads/campaign'),
      input
    );
    return response.data;
  },

  /**
   * Bulk select leads matching criteria
   */
  bulkSelect: async (input: {
    ruleId?: string;
    minDormancyScore?: number;
    maxDormancyScore?: number;
    limit?: number;
  }): Promise<{
    selectedContactIds: string[];
    totalMatched: number;
  }> => {
    const response = await apiClient.post(
      withAccountId('/dormant-leads/bulk-select'),
      input
    );
    return response.data;
  },
};
