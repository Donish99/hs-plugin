/**
 * Dormancy-related types
 * Synced with backend entity: apps/backend/src/entities/dormancy-rule.entity.ts
 */

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
  accountId: string;
  name: string;
  isActive: boolean;
  criteria: DormancyCriteria;
  actionType: ActionType;
  actionConfig: ActionConfig;
  createdAt: Date;
}

export interface CreateDormancyRuleDto {
  name: string;
  criteria: DormancyCriteria;
  actionType: ActionType;
  actionConfig: ActionConfig;
  isActive?: boolean;
}

export interface UpdateDormancyRuleDto {
  name?: string;
  criteria?: DormancyCriteria;
  actionType?: ActionType;
  actionConfig?: ActionConfig;
  isActive?: boolean;
}

export interface DormantLead {
  id: string;
  hubspotContactId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  lifecycleStage?: string;
  lastActivityDate?: Date;
  daysDormant: number;
  dormancyScore: number;
  leadScore?: number;
  matchedRuleId?: string;
  matchedRuleName?: string;
}
