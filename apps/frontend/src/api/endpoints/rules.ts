import { apiClient, withAccountId } from '../client';

/**
 * Action types for dormancy rules
 */
export type ActionType = 'email' | 'sms' | 'sequence' | 'task';

/**
 * Dormancy criteria - defines conditions for identifying dormant leads
 */
export interface DormancyCriteria {
  min_days_inactive?: number;
  no_email_opens_days?: number;
  no_email_clicks_days?: number;
  no_website_visits_days?: number;
  deal_stages?: string[];
  exclude_tags?: string[];
  min_lead_score?: number;
}

/**
 * Action configuration for what to do when a dormant lead is found
 */
export interface ActionConfig {
  template?: string;
  tone?: string;
  sequenceId?: string;
  taskOwnerId?: string;
  [key: string]: unknown;
}

export interface DormancyRule {
  id: string;
  name: string;
  isActive: boolean;
  criteria: DormancyCriteria;
  actionType: ActionType;
  actionConfig: ActionConfig;
  createdAt: string;
  matchedLeadsCount?: number;
}

export interface CreateRuleInput {
  name: string;
  criteria: DormancyCriteria;
  actionType: ActionType;
  actionConfig: ActionConfig;
  isActive?: boolean;
}

export interface UpdateRuleInput {
  name?: string;
  criteria?: DormancyCriteria;
  actionType?: ActionType;
  actionConfig?: ActionConfig;
  isActive?: boolean;
}

export interface RulesListResponse {
  rules: DormancyRule[];
  total: number;
}

export const rulesApi = {
  /**
   * Get all dormancy rules
   */
  getAll: async (): Promise<RulesListResponse> => {
    const response = await apiClient.get<DormancyRule[]>(withAccountId('/rules'));
    return {
      rules: response.data,
      total: response.data.length,
    };
  },

  /**
   * Get a single rule by ID
   */
  getById: async (id: string): Promise<DormancyRule> => {
    const response = await apiClient.get<DormancyRule>(withAccountId(`/rules/${id}`));
    return response.data;
  },

  /**
   * Create a new dormancy rule
   */
  create: async (input: CreateRuleInput): Promise<DormancyRule> => {
    const response = await apiClient.post<DormancyRule>(withAccountId('/rules'), input);
    return response.data;
  },

  /**
   * Update an existing rule
   */
  update: async (id: string, input: UpdateRuleInput): Promise<DormancyRule> => {
    const response = await apiClient.put<DormancyRule>(withAccountId(`/rules/${id}`), input);
    return response.data;
  },

  /**
   * Delete a rule
   */
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(withAccountId(`/rules/${id}`));
  },

  /**
   * Toggle rule active status
   */
  toggleActive: async (id: string): Promise<DormancyRule> => {
    const response = await apiClient.patch<DormancyRule>(withAccountId(`/rules/${id}/toggle`));
    return response.data;
  },
};
