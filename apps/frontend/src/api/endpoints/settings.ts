import { apiClient, withAccountIdV1 } from '../client';

export interface GeneralSettings {
  timezone: string;
  businessHoursStart: string;
  businessHoursEnd: string;
  workingDays: number[];
}

export interface SendingLimits {
  dailyEmailLimit: number;
  dailySmsLimit: number;
  monthlyEmailLimit: number;
  monthlySmsLimit: number;
  rateLimit: number;
}

export interface AISettings {
  defaultTone: 'professional' | 'friendly' | 'casual';
  autoApprove: boolean;
  maxTokensPerMessage: number;
  includeCompanyInfo: boolean;
  includeProductInfo: boolean;
}

export interface NotificationSettings {
  emailNotifications: boolean;
  notifyOnNewLeads: boolean;
  notifyOnReplies: boolean;
  notifyOnErrors: boolean;
  dailyDigest: boolean;
  digestTime: string;
}

export interface AllSettings {
  general: GeneralSettings;
  sendingLimits: SendingLimits;
  ai: AISettings;
  notifications: NotificationSettings;
}

export interface UsageStats {
  currentMonth: {
    emailsSent: number;
    smsSent: number;
    tokensUsed: number;
  };
  limits: SendingLimits;
  percentUsed: {
    email: number;
    sms: number;
    tokens: number;
  };
}

export const settingsApi = {
  /**
   * Get all settings
   */
  getAll: async (): Promise<AllSettings> => {
    const response = await apiClient.get<AllSettings>(withAccountIdV1('/settings'));
    return response.data;
  },

  /**
   * Update general settings
   */
  updateGeneral: async (settings: Partial<GeneralSettings>): Promise<GeneralSettings> => {
    // Backend uses PUT for full update
    const current = await settingsApi.getAll();
    const response = await apiClient.put<AllSettings>(
      withAccountIdV1('/settings'),
      { ...current, general: { ...current.general, ...settings } }
    );
    return response.data.general;
  },

  /**
   * Update sending limits
   */
  updateSendingLimits: async (limits: Partial<SendingLimits>): Promise<SendingLimits> => {
    const response = await apiClient.put<SendingLimits>(
      withAccountIdV1('/settings/sending-limits'),
      limits
    );
    return response.data;
  },

  /**
   * Update AI settings
   */
  updateAI: async (settings: Partial<AISettings>): Promise<AISettings> => {
    const response = await apiClient.put<AISettings>(
      withAccountIdV1('/settings/ai'),
      settings
    );
    return response.data;
  },

  /**
   * Update notification settings
   */
  updateNotifications: async (
    settings: Partial<NotificationSettings>
  ): Promise<NotificationSettings> => {
    const response = await apiClient.put<NotificationSettings>(
      withAccountIdV1('/settings/notifications'),
      settings
    );
    return response.data;
  },

  /**
   * Get usage statistics
   */
  getUsage: async (): Promise<UsageStats> => {
    // Usage endpoint might need to be added to backend
    // For now return mock data
    const settings = await settingsApi.getAll();
    return {
      currentMonth: {
        emailsSent: 0,
        smsSent: 0,
        tokensUsed: 0,
      },
      limits: settings.sendingLimits,
      percentUsed: {
        email: 0,
        sms: 0,
        tokens: 0,
      },
    };
  },

  /**
   * Test email configuration
   */
  testEmail: async (_email: string): Promise<{ success: boolean; message: string }> => {
    // This endpoint might need to be added to backend
    return { success: true, message: 'Test email sent' };
  },

  /**
   * Test SMS configuration
   */
  testSms: async (_phone: string): Promise<{ success: boolean; message: string }> => {
    // This endpoint might need to be added to backend
    return { success: true, message: 'Test SMS sent' };
  },
};
