/**
 * Dormancy-related types
 */

export interface DormancyRule {
  id: string;
  hubspotAccountId: string;
  name: string;
  description?: string;
  inactivityDays: number;
  lifecycleStages: string[];
  excludedTags?: string[];
  includedTags?: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateDormancyRuleDto {
  name: string;
  description?: string;
  inactivityDays: number;
  lifecycleStages: string[];
  excludedTags?: string[];
  includedTags?: string[];
  isActive?: boolean;
}

export interface UpdateDormancyRuleDto {
  name?: string;
  description?: string;
  inactivityDays?: number;
  lifecycleStages?: string[];
  excludedTags?: string[];
  includedTags?: string[];
  isActive?: boolean;
}

export interface DormantLead {
  id: string;
  hubspotContactId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  lifecycleStage: string;
  lastActivityDate: Date;
  daysDormant: number;
  matchedRuleId: string;
}
