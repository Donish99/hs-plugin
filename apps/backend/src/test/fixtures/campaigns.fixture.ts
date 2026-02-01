/**
 * Test fixtures for campaign-related tests
 */

export interface CampaignFixture {
  id: string;
  accountId: string;
  ruleId: string;
  name: string;
  status: 'draft' | 'scheduled' | 'running' | 'completed' | 'paused';
  totalContacts: number;
  emailsSent: number;
  emailsOpened: number;
  emailsReplied: number;
  meetingsBooked: number;
  scheduledAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
}

export interface DormancyRuleFixture {
  id: string;
  accountId: string;
  name: string;
  isActive: boolean;
  criteria: {
    min_days_inactive: number;
    no_email_opens_days?: number;
    deal_stages?: string[];
    exclude_tags?: string[];
    min_lead_score?: number;
  };
  actionType: 'email' | 'sms' | 'sequence' | 'task';
  actionConfig: Record<string, unknown>;
}

export const defaultDormancyRuleFixture: DormancyRuleFixture = {
  id: 'rule-1',
  accountId: 'account-1',
  name: '30-Day Inactive Rule',
  isActive: true,
  criteria: {
    min_days_inactive: 30,
    no_email_opens_days: 14,
    deal_stages: ['qualifiedtobuy', 'presentationscheduled'],
    exclude_tags: ['vip', 'do-not-contact'],
    min_lead_score: 50,
  },
  actionType: 'email',
  actionConfig: {
    template: 'reactivation-v1',
    tone: 'professional',
  },
};

export const aggressiveDormancyRuleFixture: DormancyRuleFixture = {
  id: 'rule-2',
  accountId: 'account-1',
  name: '14-Day Quick Follow-up',
  isActive: true,
  criteria: {
    min_days_inactive: 14,
    no_email_opens_days: 7,
  },
  actionType: 'sms',
  actionConfig: {
    template: 'quick-checkin',
  },
};

export const draftCampaignFixture: CampaignFixture = {
  id: 'campaign-1',
  accountId: 'account-1',
  ruleId: 'rule-1',
  name: 'Q1 Reactivation Campaign',
  status: 'draft',
  totalContacts: 150,
  emailsSent: 0,
  emailsOpened: 0,
  emailsReplied: 0,
  meetingsBooked: 0,
  createdAt: new Date('2024-01-15'),
};

export const runningCampaignFixture: CampaignFixture = {
  id: 'campaign-2',
  accountId: 'account-1',
  ruleId: 'rule-1',
  name: 'January Outreach',
  status: 'running',
  totalContacts: 100,
  emailsSent: 45,
  emailsOpened: 18,
  emailsReplied: 5,
  meetingsBooked: 2,
  scheduledAt: new Date('2024-01-10'),
  startedAt: new Date('2024-01-10'),
  createdAt: new Date('2024-01-08'),
};

export const completedCampaignFixture: CampaignFixture = {
  id: 'campaign-3',
  accountId: 'account-1',
  ruleId: 'rule-2',
  name: 'December Re-engagement',
  status: 'completed',
  totalContacts: 200,
  emailsSent: 200,
  emailsOpened: 78,
  emailsReplied: 22,
  meetingsBooked: 8,
  scheduledAt: new Date('2023-12-01'),
  startedAt: new Date('2023-12-01'),
  completedAt: new Date('2023-12-15'),
  createdAt: new Date('2023-11-28'),
};

export const campaignsListFixture: CampaignFixture[] = [
  draftCampaignFixture,
  runningCampaignFixture,
  completedCampaignFixture,
];
