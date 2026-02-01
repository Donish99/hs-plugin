import { apiClient, withAccountIdV1 } from '../client';

export type ActivityType =
  | 'lead_detected'
  | 'campaign_started'
  | 'campaign_completed'
  | 'message_sent'
  | 'message_delivered'
  | 'message_opened'
  | 'message_clicked'
  | 'message_replied'
  | 'message_bounced'
  | 'rule_created'
  | 'rule_updated'
  | 'settings_changed'
  | 'error';

export interface ActivityItem {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  metadata?: Record<string, unknown>;
  contactId?: string;
  contactEmail?: string;
  campaignId?: string;
  campaignName?: string;
  createdAt: string;
}

export interface ActivityListParams {
  page?: number;
  pageSize?: number;
  limit?: number;  // Alias for pageSize for backward compatibility
  type?: ActivityType;
  eventType?: string;
  startDate?: string;
  endDate?: string;
  contactId?: string;
  contactEmail?: string;
  campaignId?: string;
  search?: string;
}

export interface ActivityListResponse {
  activities: ActivityItem[];
  total: number;
  page: number;
  limit: number;
}

export const activityApi = {
  /**
   * Get paginated list of activities
   */
  getAll: async (params?: ActivityListParams): Promise<ActivityListResponse> => {
    // Support both limit and pageSize parameters
    const pageSize = params?.pageSize ?? params?.limit ?? 20;
    const response = await apiClient.get<{
      activities: ActivityItem[];
      total: number;
      page: number;
      pageSize: number;
    }>(
      withAccountIdV1('/analytics/activity'),
      { params: { ...params, pageSize } }
    );
    return {
      activities: response.data.activities,
      total: response.data.total,
      page: response.data.page,
      limit: response.data.pageSize,
    };
  },

  /**
   * Get recent activities for dashboard
   */
  getRecent: async (limit = 10): Promise<ActivityItem[]> => {
    const response = await activityApi.getAll({ pageSize: limit });
    return response.activities;
  },

  /**
   * Get activity stats
   */
  getStats: async (
    _period?: 'day' | 'week' | 'month'
  ): Promise<{
    byType: Record<ActivityType, number>;
    total: number;
    errors: number;
  }> => {
    // Derive stats from activity list
    const response = await activityApi.getAll({ pageSize: 100 });
    const byType: Record<string, number> = {};
    let errors = 0;

    response.activities.forEach(a => {
      byType[a.type] = (byType[a.type] || 0) + 1;
      if (a.type === 'error') errors++;
    });

    return {
      byType: byType as Record<ActivityType, number>,
      total: response.total,
      errors,
    };
  },

  /**
   * Export activity log
   */
  export: async (
    format: 'csv' | 'json',
    params?: ActivityListParams
  ): Promise<Blob> => {
    const response = await apiClient.get(
      withAccountIdV1('/analytics/activity/export'),
      {
        params: { format, ...params },
        responseType: 'blob',
      }
    );
    return response.data;
  },
};
