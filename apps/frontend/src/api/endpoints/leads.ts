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

/**
 * Backend PrioritizedContact shape (what the API actually returns)
 */
interface BackendContact {
  contact: {
    id: string;
    properties: Record<string, string | null>;
    createdAt: string;
    updatedAt: string;
  };
  dormancyScore: {
    totalScore: number;
    factors: {
      daysSinceLastContact: number | null;
      daysSinceLastOpen: number | null;
      daysSinceLastClick: number | null;
      daysSinceLastVisit: number | null;
      lastContactScore: number;
      emailEngagementScore: number;
      websiteEngagementScore: number;
    };
    calculatedAt: string;
  };
  leadScore: number;
  dealValue: number;
  priorityScore: number;
  lastEngagementDate: string | null;
}

/**
 * Transform backend PrioritizedContact to frontend DormantLead
 */
function transformContact(backendContact: BackendContact): DormantLead {
  const { contact, dormancyScore, leadScore, lastEngagementDate } = backendContact;
  const props = contact.properties || {};

  // Use backend-calculated daysSinceLastContact, fallback to calculating from dates
  let daysDormant = dormancyScore?.factors?.daysSinceLastContact ?? 0;

  // If backend didn't calculate it, try to calculate from available dates
  if (!daysDormant) {
    const lastContactStr = props.notes_last_contacted || lastEngagementDate;
    if (lastContactStr) {
      const lastContact = new Date(lastContactStr);
      if (!isNaN(lastContact.getTime())) {
        const now = new Date();
        daysDormant = Math.floor((now.getTime() - lastContact.getTime()) / (1000 * 60 * 60 * 24));
      }
    }
  }

  // Determine last contact date from various sources
  const lastContactDate = props.notes_last_contacted || lastEngagementDate || undefined;

  return {
    id: contact.id,
    hubspotContactId: contact.id,
    email: props.email || '',
    firstName: props.firstname || undefined,
    lastName: props.lastname || undefined,
    company: props.company || undefined,
    phone: props.phone || undefined,
    lastContactDate: lastContactDate || undefined,
    daysDormant: daysDormant > 0 ? daysDormant : 0,
    dormancyScore: dormancyScore?.totalScore ?? 0,
    leadScore: leadScore || undefined,
    matchedRuleId: props._matchedRuleId || undefined,
    matchedRuleName: props._matchedRuleName || undefined,
    lifecycleStage: props.lifecyclestage || undefined,
    createdAt: contact.createdAt,
    properties: props as Record<string, string>,
  };
}

export const leadsApi = {
  /**
   * Get paginated list of dormant leads
   */
  getAll: async (params?: LeadsListParams): Promise<LeadsListResponse> => {
    const response = await apiClient.get<{
      contacts: BackendContact[];
      total: number;
      page: number;
      limit: number;
      totalPages: number
    }>(
      withAccountId('/dormant-leads'),
      { params }
    );

    // Transform backend contacts to frontend format
    const transformedContacts = response.data.contacts.map(transformContact);

    return {
      contacts: transformedContacts,
      leads: transformedContacts,
      total: response.data.total,
      page: response.data.page,
      limit: response.data.limit,
      totalPages: response.data.totalPages,
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
  triggerScan: async (options?: {
    ruleId?: string;
    forceRefresh?: boolean;
  }): Promise<{ success: boolean; message: string; accountId: string; ruleId?: string }> => {
    const response = await apiClient.post(
      withAccountId('/scan/trigger'),
      options || {}
    );
    return response.data;
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
