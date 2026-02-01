import { apiClient, withAccountId } from '../client';

export interface DormancyCriterion {
  field: string;
  operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains' | 'not_contains';
  value: string | number;
}

export interface DormancyRule {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  daysSinceLastContact: number;
  criteria: DormancyCriterion[];
  priority: number;
  matchedLeadsCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRuleInput {
  name: string;
  description?: string;
  daysSinceLastContact: number;
  criteria: DormancyCriterion[];
  priority?: number;
}

export interface UpdateRuleInput {
  name?: string;
  description?: string;
  isActive?: boolean;
  daysSinceLastContact?: number;
  criteria?: DormancyCriterion[];
  priority?: number;
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
