import { apiClient, withAccountId } from '../client';

export interface GenerateMessageInput {
  contactId: string;
  channel: 'email' | 'sms';
  tone?: 'professional' | 'friendly' | 'casual';
  context?: string;
  templateId?: string;
}

export interface GeneratedMessage {
  id: string;
  contactId: string;
  channel: 'email' | 'sms';
  subject?: string;
  body: string;
  tone: string;
  tokensUsed: number;
  estimatedCost: number;
  createdAt: string;
}

export interface MessageVariant {
  id: string;
  subject?: string;
  body: string;
  tone: string;
}

export interface GenerateVariantsInput {
  contactId: string;
  channel: 'email' | 'sms';
  count?: number;
}

export interface GenerateVariantsResponse {
  variants: MessageVariant[];
  tokensUsed: number;
  estimatedCost: number;
}

export interface MessageTemplate {
  id: string;
  name: string;
  channel: 'email' | 'sms';
  subject?: string;
  bodyTemplate: string;
  tone: string;
  createdAt: string;
}

export const generateApi = {
  /**
   * Generate a personalized message for a contact
   */
  generateMessage: async (input: GenerateMessageInput): Promise<GeneratedMessage> => {
    const response = await apiClient.post<GeneratedMessage>(
      withAccountId('/generate/message'),
      input
    );
    return response.data;
  },

  /**
   * Generate multiple message variants for A/B testing
   */
  generateVariants: async (input: GenerateVariantsInput): Promise<GenerateVariantsResponse> => {
    const response = await apiClient.post<GenerateVariantsResponse>(
      withAccountId('/generate/variants'),
      input
    );
    return response.data;
  },

  /**
   * Get available message templates
   */
  getTemplates: async (_channel?: 'email' | 'sms'): Promise<MessageTemplate[]> => {
    // Templates endpoint might need to be added to backend
    return [];
  },

  /**
   * Preview a message without saving
   */
  preview: async (
    input: GenerateMessageInput
  ): Promise<{ subject?: string; body: string; tokensEstimate: number; estimatedCost: number }> => {
    const response = await apiClient.post<{
      subject?: string;
      body: string;
      preview: boolean;
      estimatedCost: number;
    }>(withAccountId('/generate/preview'), input);
    return {
      subject: response.data.subject,
      body: response.data.body,
      tokensEstimate: 0,
      estimatedCost: response.data.estimatedCost,
    };
  },

  /**
   * Generate messages in batch
   */
  generateBatch: async (input: {
    contactIds: string[];
    channel: 'email' | 'sms';
    tone?: 'professional' | 'friendly' | 'casual';
    templateId?: string;
  }): Promise<{
    successful: GeneratedMessage[];
    failed: Array<{ contactId: string; error: string }>;
    totalTokensUsed: number;
    estimatedCost: number;
  }> => {
    const response = await apiClient.post(
      withAccountId('/generate/batch'),
      input
    );
    return response.data;
  },

  /**
   * Validate a message before sending
   */
  validate: async (input: {
    channel: 'email' | 'sms';
    subject?: string;
    body: string;
  }): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> => {
    const response = await apiClient.post(
      withAccountId('/generate/validate'),
      input
    );
    return response.data;
  },

  /**
   * Estimate generation cost
   */
  estimateCost: async (input: {
    contactCount: number;
    channel: 'email' | 'sms';
    includeVariants?: boolean;
  }): Promise<{
    estimatedCost: number;
    contactCount: number;
    tokensEstimate: number;
    details: string;
  }> => {
    const response = await apiClient.post(
      withAccountId('/generate/estimate-cost'),
      input
    );
    return response.data;
  },
};
