/**
 * Campaign-related types
 */

export type CampaignStatus = 'draft' | 'scheduled' | 'active' | 'paused' | 'completed' | 'cancelled';
export type CampaignChannel = 'email' | 'sms' | 'both';

export interface Campaign {
  id: string;
  hubspotAccountId: string;
  name: string;
  description?: string;
  status: CampaignStatus;
  channel: CampaignChannel;
  dormancyRuleId: string;
  scheduledAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  totalLeads: number;
  sentCount: number;
  deliveredCount: number;
  openedCount: number;
  clickedCount: number;
  repliedCount: number;
  bouncedCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCampaignDto {
  name: string;
  description?: string;
  channel: CampaignChannel;
  dormancyRuleId: string;
  scheduledAt?: Date;
}

export interface UpdateCampaignDto {
  name?: string;
  description?: string;
  status?: CampaignStatus;
  scheduledAt?: Date;
}

export interface CampaignStats {
  totalLeads: number;
  sentCount: number;
  deliveredCount: number;
  openedCount: number;
  clickedCount: number;
  repliedCount: number;
  bouncedCount: number;
  deliveryRate: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
}
