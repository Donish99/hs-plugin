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

/**
 * Map backend event types to frontend activity types
 */
function mapEventTypeToActivityType(eventType: string): ActivityType {
  const mapping: Record<string, ActivityType> = {
    email_sent: 'message_sent',
    email_delivered: 'message_delivered',
    email_opened: 'message_opened',
    email_clicked: 'message_clicked',
    email_replied: 'message_replied',
    email_bounced: 'message_bounced',
    sms_sent: 'message_sent',
    sms_delivered: 'message_delivered',
    sms_replied: 'message_replied',
    campaign_started: 'campaign_started',
    campaign_completed: 'campaign_completed',
    contact_reactivated: 'lead_detected',
  };
  return mapping[eventType] || 'message_sent';
}

/**
 * Format activity title from event type
 */
function formatActivityTitle(eventType: string, contactName?: string): string {
  const titles: Record<string, string> = {
    email_sent: 'Email sent',
    email_delivered: 'Email delivered',
    email_opened: 'Email opened',
    email_clicked: 'Link clicked',
    email_replied: 'Reply received',
    email_bounced: 'Email bounced',
    sms_sent: 'SMS sent',
    sms_delivered: 'SMS delivered',
    sms_replied: 'SMS reply received',
    campaign_started: 'Campaign started',
    campaign_completed: 'Campaign completed',
    contact_reactivated: 'Lead reactivated',
  };
  const title = titles[eventType] || 'Activity';
  return contactName ? `${title} - ${contactName}` : title;
}

/**
 * Format activity description from entry data
 */
function formatActivityDescription(entry: {
  contactEmail?: string;
  campaignName?: string;
  subject?: string;
  companyName?: string;
}): string {
  const parts: string[] = [];
  if (entry.subject) parts.push(entry.subject);
  if (entry.contactEmail) parts.push(entry.contactEmail);
  if (entry.campaignName) parts.push(`Campaign: ${entry.campaignName}`);
  if (entry.companyName) parts.push(entry.companyName);
  return parts.join(' • ') || 'No details available';
}

export const activityApi = {
  /**
   * Get paginated list of activities
   */
  getAll: async (params?: ActivityListParams): Promise<ActivityListResponse> => {
    // Support both limit and pageSize parameters
    const pageSize = params?.pageSize ?? params?.limit ?? 20;
    const response = await apiClient.get<{
      entries: Array<{
        id: string;
        eventType: string;
        contactName?: string;
        contactEmail?: string;
        companyName?: string;
        campaignId?: string;
        campaignName?: string;
        subject?: string;
        createdAt: string;
        metadata?: Record<string, unknown>;
      }>;
      total: number;
      page: number;
      pageSize: number;
    }>(
      withAccountIdV1('/analytics/activity'),
      { params: { ...params, pageSize } }
    );

    // Map backend response to frontend format
    const activities: ActivityItem[] = (response.data.entries || []).map(entry => ({
      id: entry.id,
      type: mapEventTypeToActivityType(entry.eventType),
      title: formatActivityTitle(entry.eventType, entry.contactName),
      description: formatActivityDescription(entry),
      metadata: entry.metadata,
      contactId: undefined,
      contactEmail: entry.contactEmail,
      campaignId: entry.campaignId,
      campaignName: entry.campaignName,
      createdAt: entry.createdAt,
    }));

    return {
      activities,
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
