import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HubspotAccount, AccountPlan } from '../../entities/hubspot-account.entity';

/**
 * Account settings interface
 */
export interface AccountSettings {
  timezone: string;
  businessHoursOnly: boolean;
  businessHoursStart?: string;
  businessHoursEnd?: string;
  autoApprove: boolean;
  defaultTone: string;
  notificationEmail?: string;
}

/**
 * Update settings DTO
 */
export interface UpdateSettingsDto {
  timezone?: string;
  businessHoursOnly?: boolean;
  businessHoursStart?: string;
  businessHoursEnd?: string;
  defaultTone?: string;
  notificationEmail?: string;
}

/**
 * Sending limits interface
 */
export interface SendingLimits {
  monthlyLimit: number;
  monthlyUsed: number;
  monthlyRemaining: number;
  dailyLimit?: number;
  dailyUsed?: number;
  dailyRemaining?: number;
  hourlyLimit?: number;
  hourlyUsed?: number;
  hourlyRemaining?: number;
  plan: AccountPlan;
}

/**
 * Update sending limits DTO
 */
export interface UpdateSendingLimitsDto {
  monthlyLimit?: number;
  dailyLimit?: number;
  hourlyLimit?: number;
}

/**
 * AI settings interface
 */
export interface AiSettings {
  tonePreference: string;
  autoApprove: boolean;
  autoApproveThreshold: number;
  reviewRequired: boolean;
}

/**
 * Update AI settings DTO
 */
export interface UpdateAiSettingsDto {
  tonePreference?: string;
  autoApprove?: boolean;
  autoApproveThreshold?: number;
  reviewRequired?: boolean;
}

/**
 * Notification preferences interface
 */
export interface NotificationPreferences {
  email?: string;
  campaignComplete: boolean;
  dailyDigest: boolean;
  weeklyReport: boolean;
  errorAlerts: boolean;
  quotaWarnings: boolean;
}

/**
 * Update notification preferences DTO
 */
export interface UpdateNotificationPreferencesDto {
  email?: string;
  campaignComplete?: boolean;
  dailyDigest?: boolean;
  weeklyReport?: boolean;
  errorAlerts?: boolean;
  quotaWarnings?: boolean;
}

// Valid IANA timezone identifiers (subset)
const VALID_TIMEZONES = new Set([
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'Pacific/Honolulu',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Dubai',
  'Australia/Sydney',
  'Australia/Melbourne',
]);

// Plan-based limits
const PLAN_LIMITS: Record<AccountPlan, { monthly: number; daily: number; hourly: number }> = {
  [AccountPlan.FREE]: { monthly: 100, daily: 20, hourly: 5 },
  [AccountPlan.STARTER]: { monthly: 500, daily: 50, hourly: 15 },
  [AccountPlan.PROFESSIONAL]: { monthly: 2000, daily: 200, hourly: 50 },
  [AccountPlan.ENTERPRISE]: { monthly: 10000, daily: 1000, hourly: 200 },
};

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(HubspotAccount)
    private readonly accountRepository: Repository<HubspotAccount>,
  ) {}

  /**
   * Get account settings
   */
  async getSettings(accountId: string): Promise<AccountSettings> {
    const account = await this.findAccount(accountId);

    return {
      timezone: account.settings?.timezone || 'UTC',
      businessHoursOnly: account.settings?.businessHoursOnly || false,
      businessHoursStart:
        ((account.settings as Record<string, unknown>)?.businessHoursStart as string) || '09:00',
      businessHoursEnd:
        ((account.settings as Record<string, unknown>)?.businessHoursEnd as string) || '17:00',
      autoApprove: account.settings?.autoApprove || false,
      defaultTone: account.settings?.defaultTone || 'professional',
      notificationEmail: account.settings?.notificationEmail,
    };
  }

  /**
   * Update account settings
   */
  async updateSettings(accountId: string, updates: UpdateSettingsDto): Promise<AccountSettings> {
    const account = await this.findAccount(accountId);

    // Validate timezone if provided
    if (updates.timezone && !VALID_TIMEZONES.has(updates.timezone)) {
      throw new BadRequestException('Invalid timezone');
    }

    // Merge settings
    account.settings = {
      ...account.settings,
      ...updates,
    };

    await this.accountRepository.save(account);

    return this.getSettings(accountId);
  }

  /**
   * Get sending limits
   */
  async getSendingLimits(accountId: string): Promise<SendingLimits> {
    const account = await this.findAccount(accountId);
    const planLimits = PLAN_LIMITS[account.plan];

    // Calculate daily and hourly usage (would need additional tracking in production)
    const dailyLimit = Math.min(
      (account as unknown as Record<string, number>).dailyEmailLimit || planLimits.daily,
      planLimits.daily,
    );
    const hourlyLimit = Math.min(
      (account as unknown as Record<string, number>).hourlyEmailLimit || planLimits.hourly,
      planLimits.hourly,
    );

    return {
      monthlyLimit: account.monthlyEmailLimit,
      monthlyUsed: account.emailsSentThisMonth,
      monthlyRemaining: Math.max(0, account.monthlyEmailLimit - account.emailsSentThisMonth),
      dailyLimit,
      dailyUsed: 0, // Would need daily tracking
      dailyRemaining: dailyLimit,
      hourlyLimit,
      hourlyUsed: 0, // Would need hourly tracking
      hourlyRemaining: hourlyLimit,
      plan: account.plan,
    };
  }

  /**
   * Update sending limits
   */
  async updateSendingLimits(
    accountId: string,
    updates: UpdateSendingLimitsDto,
  ): Promise<SendingLimits> {
    const account = await this.findAccount(accountId);
    const planLimits = PLAN_LIMITS[account.plan];

    // Validate against plan limits
    if (updates.monthlyLimit && updates.monthlyLimit > planLimits.monthly) {
      throw new BadRequestException('Exceeds plan limit');
    }

    if (updates.monthlyLimit) {
      account.monthlyEmailLimit = updates.monthlyLimit;
    }

    await this.accountRepository.save(account);

    return this.getSendingLimits(accountId);
  }

  /**
   * Get AI settings
   */
  async getAiSettings(accountId: string): Promise<AiSettings> {
    const account = await this.findAccount(accountId);
    const settings = account.settings as Record<string, unknown>;

    return {
      tonePreference: (settings?.defaultTone as string) || 'professional',
      autoApprove: (settings?.autoApprove as boolean) || false,
      autoApproveThreshold: (settings?.autoApproveThreshold as number) || 0.8,
      reviewRequired: (settings?.reviewRequired as boolean) ?? true,
    };
  }

  /**
   * Update AI settings
   */
  async updateAiSettings(accountId: string, updates: UpdateAiSettingsDto): Promise<AiSettings> {
    const account = await this.findAccount(accountId);

    // Validate threshold
    if (
      updates.autoApproveThreshold !== undefined &&
      (updates.autoApproveThreshold < 0 || updates.autoApproveThreshold > 1)
    ) {
      throw new BadRequestException('Threshold must be between 0 and 1');
    }

    // Map DTO fields to settings fields
    const settingsUpdates: Record<string, unknown> = {};
    if (updates.tonePreference) settingsUpdates.defaultTone = updates.tonePreference;
    if (updates.autoApprove !== undefined) settingsUpdates.autoApprove = updates.autoApprove;
    if (updates.autoApproveThreshold !== undefined) {
      settingsUpdates.autoApproveThreshold = updates.autoApproveThreshold;
    }
    if (updates.reviewRequired !== undefined)
      settingsUpdates.reviewRequired = updates.reviewRequired;

    account.settings = {
      ...account.settings,
      ...settingsUpdates,
    };

    await this.accountRepository.save(account);

    return this.getAiSettings(accountId);
  }

  /**
   * Get notification preferences
   */
  async getNotificationPreferences(accountId: string): Promise<NotificationPreferences> {
    const account = await this.findAccount(accountId);
    const settings = account.settings as Record<string, unknown>;

    return {
      email: settings?.notificationEmail as string | undefined,
      campaignComplete: (settings?.notifyCampaignComplete as boolean) ?? true,
      dailyDigest: (settings?.notifyDailyDigest as boolean) ?? false,
      weeklyReport: (settings?.notifyWeeklyReport as boolean) ?? true,
      errorAlerts: (settings?.notifyErrorAlerts as boolean) ?? true,
      quotaWarnings: (settings?.notifyQuotaWarnings as boolean) ?? true,
    };
  }

  /**
   * Update notification preferences
   */
  async updateNotificationPreferences(
    accountId: string,
    updates: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferences> {
    const account = await this.findAccount(accountId);

    // Map DTO fields to settings fields
    const settingsUpdates: Record<string, unknown> = {};
    if (updates.email !== undefined) settingsUpdates.notificationEmail = updates.email;
    if (updates.campaignComplete !== undefined) {
      settingsUpdates.notifyCampaignComplete = updates.campaignComplete;
    }
    if (updates.dailyDigest !== undefined) settingsUpdates.notifyDailyDigest = updates.dailyDigest;
    if (updates.weeklyReport !== undefined)
      settingsUpdates.notifyWeeklyReport = updates.weeklyReport;
    if (updates.errorAlerts !== undefined) settingsUpdates.notifyErrorAlerts = updates.errorAlerts;
    if (updates.quotaWarnings !== undefined)
      settingsUpdates.notifyQuotaWarnings = updates.quotaWarnings;

    account.settings = {
      ...account.settings,
      ...settingsUpdates,
    };

    await this.accountRepository.save(account);

    return this.getNotificationPreferences(accountId);
  }

  /**
   * Reset monthly email counter
   */
  async resetMonthlyCounter(accountId: string): Promise<void> {
    await this.accountRepository.update(accountId, {
      emailsSentThisMonth: 0,
    });
  }

  /**
   * Find account or throw
   */
  private async findAccount(accountId: string): Promise<HubspotAccount> {
    const account = await this.accountRepository.findOne({
      where: { id: accountId },
    });

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    return account;
  }
}
