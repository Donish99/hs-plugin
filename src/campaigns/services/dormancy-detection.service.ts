import { Injectable, Logger } from '@nestjs/common';
import { HubSpotContact } from './scanner.service';

/**
 * Dormancy score breakdown for a contact
 */
export interface DormancyScore {
  totalScore: number;
  factors: {
    daysSinceLastContact: number | null;
    daysSinceLastOpen: number | null;
    daysSinceLastClick: number | null;
    daysSinceLastVisit: number | null;
    lastContactScore: number;
    emailEngagementScore: number;
    websiteEngagementScore: number;
  };
  calculatedAt: Date;
}

/**
 * Prioritization options
 */
export interface PrioritizationOptions {
  sortBy: 'dormancyScore' | 'leadScore' | 'dealValue' | 'recency' | 'composite';
  sortOrder: 'asc' | 'desc';
  limit?: number;
}

/**
 * Contact with priority scoring
 */
export interface PrioritizedContact {
  contact: HubSpotContact;
  dormancyScore: DormancyScore;
  leadScore: number;
  dealValue: number;
  priorityScore: number;
  lastEngagementDate: Date | null;
}

/**
 * Distribution counts by level
 */
export interface LevelDistribution {
  high: number;
  medium: number;
  low: number;
}

/**
 * Dormancy scan report
 */
export interface DormancyReport {
  ruleId: string;
  totalContacts: number;
  averageDormancyScore: number;
  totalDealValue: number;
  dormancyDistribution: LevelDistribution;
  leadScoreDistribution: LevelDistribution;
  topPriorityContacts: PrioritizedContact[];
  generatedAt: Date;
}

/**
 * Contact engagement data
 */
export interface ContactEngagementData {
  contactId: string;
  email: string;
  name: string;
  company: string | null;
  daysSinceLastContact: number | null;
  daysSinceLastOpen: number | null;
  daysSinceLastClick: number | null;
  daysSinceLastVisit: number | null;
  daysSinceLastReply: number | null;
  totalContactAttempts: number;
  leadScore: number;
  dealValue: number;
}

// Score weights for composite scoring
const WEIGHTS = {
  lastContact: 0.3,
  emailEngagement: 0.25,
  websiteEngagement: 0.15,
  leadScore: 0.2,
  dealValue: 0.1,
};

// Thresholds for dormancy levels
const DORMANCY_THRESHOLDS = {
  high: 70,
  medium: 40,
};

// Thresholds for lead score levels
const LEAD_SCORE_THRESHOLDS = {
  high: 70,
  medium: 40,
};

// Maximum days for score calculation (cap to prevent extreme scores)
const MAX_DAYS_FOR_SCORING = 365;

@Injectable()
export class DormancyDetectionService {
  private readonly logger = new Logger(DormancyDetectionService.name);

  /**
   * Calculate dormancy score for a single contact
   */
  calculateDormancyScore(contact: HubSpotContact): DormancyScore {
    const now = new Date();
    const properties = contact.properties;

    const daysSinceLastContact = this.calculateDaysSince(
      properties.notes_last_contacted,
      now,
    );
    const daysSinceLastOpen = this.calculateDaysSince(
      properties.hs_email_last_open_date,
      now,
    );
    const daysSinceLastClick = this.calculateDaysSince(
      properties.hs_email_last_click_date,
      now,
    );
    const daysSinceLastVisit = this.calculateDaysSince(
      properties.hs_analytics_last_visit_timestamp,
      now,
    );

    // Calculate individual factor scores (0-100 scale)
    const lastContactScore = this.calculateFactorScore(daysSinceLastContact);
    const emailEngagementScore = this.calculateEmailEngagementScore(
      daysSinceLastOpen,
      daysSinceLastClick,
    );
    const websiteEngagementScore = this.calculateFactorScore(daysSinceLastVisit);

    // Determine which engagement types have actual data
    const hasLastContact = daysSinceLastContact !== null;
    const hasEmailEngagement = daysSinceLastOpen !== null || daysSinceLastClick !== null;
    const hasWebsiteEngagement = daysSinceLastVisit !== null;

    // Calculate weighted total score
    const totalScore = this.calculateTotalScore({
      lastContactScore,
      emailEngagementScore,
      websiteEngagementScore,
      hasAnyData: hasLastContact || hasEmailEngagement || hasWebsiteEngagement,
      hasLastContact,
      hasEmailEngagement,
      hasWebsiteEngagement,
    });

    return {
      totalScore: Math.round(totalScore * 100) / 100,
      factors: {
        daysSinceLastContact,
        daysSinceLastOpen,
        daysSinceLastClick,
        daysSinceLastVisit,
        lastContactScore,
        emailEngagementScore,
        websiteEngagementScore,
      },
      calculatedAt: now,
    };
  }

  /**
   * Prioritize contacts based on various criteria
   */
  prioritizeContacts(
    contacts: HubSpotContact[],
    options: PrioritizationOptions,
  ): PrioritizedContact[] {
    if (contacts.length === 0) {
      return [];
    }

    const prioritizedContacts: PrioritizedContact[] = contacts.map((contact) => {
      const dormancyScore = this.calculateDormancyScore(contact);
      const leadScore = this.parseNumericProperty(contact.properties.hubspotscore);
      const dealValue = this.parseNumericProperty(contact.properties.hs_deal_amount);
      const lastEngagementDate = this.getLastEngagementDate(contact);

      // Calculate composite priority score
      const priorityScore = this.calculatePriorityScore({
        dormancyScore: dormancyScore.totalScore,
        leadScore,
        dealValue,
      });

      return {
        contact,
        dormancyScore,
        leadScore,
        dealValue,
        priorityScore,
        lastEngagementDate,
      };
    });

    // Sort based on options
    this.sortContacts(prioritizedContacts, options);

    // Apply limit if specified
    if (options.limit && options.limit > 0) {
      return prioritizedContacts.slice(0, options.limit);
    }

    return prioritizedContacts;
  }

  /**
   * Generate a dormancy report for a scan
   */
  generateDormancyReport(
    ruleId: string,
    contacts: HubSpotContact[],
  ): DormancyReport {
    if (contacts.length === 0) {
      return {
        ruleId,
        totalContacts: 0,
        averageDormancyScore: 0,
        totalDealValue: 0,
        dormancyDistribution: { high: 0, medium: 0, low: 0 },
        leadScoreDistribution: { high: 0, medium: 0, low: 0 },
        topPriorityContacts: [],
        generatedAt: new Date(),
      };
    }

    const prioritizedContacts = this.prioritizeContacts(contacts, {
      sortBy: 'composite',
      sortOrder: 'desc',
    });

    // Calculate aggregate metrics
    const totalDormancyScore = prioritizedContacts.reduce(
      (sum, p) => sum + p.dormancyScore.totalScore,
      0,
    );
    const totalDealValue = prioritizedContacts.reduce(
      (sum, p) => sum + p.dealValue,
      0,
    );

    // Calculate distributions
    const dormancyDistribution = this.calculateDistribution(
      prioritizedContacts.map((p) => p.dormancyScore.totalScore),
      DORMANCY_THRESHOLDS,
    );
    const leadScoreDistribution = this.calculateDistribution(
      prioritizedContacts.map((p) => p.leadScore),
      LEAD_SCORE_THRESHOLDS,
    );

    return {
      ruleId,
      totalContacts: contacts.length,
      averageDormancyScore:
        Math.round((totalDormancyScore / contacts.length) * 100) / 100,
      totalDealValue,
      dormancyDistribution,
      leadScoreDistribution,
      topPriorityContacts: prioritizedContacts.slice(0, 10),
      generatedAt: new Date(),
    };
  }

  /**
   * Extract engagement data from a contact
   */
  getContactEngagementData(contact: HubSpotContact): ContactEngagementData {
    const now = new Date();
    const props = contact.properties;

    const firstName = props.firstname || '';
    const lastName = props.lastname || '';
    const name = [firstName, lastName].filter(Boolean).join(' ');

    return {
      contactId: contact.id,
      email: props.email || '',
      name,
      company: props.company || null,
      daysSinceLastContact: this.calculateDaysSince(props.notes_last_contacted, now),
      daysSinceLastOpen: this.calculateDaysSince(props.hs_email_last_open_date, now),
      daysSinceLastClick: this.calculateDaysSince(props.hs_email_last_click_date, now),
      daysSinceLastVisit: this.calculateDaysSince(
        props.hs_analytics_last_visit_timestamp,
        now,
      ),
      daysSinceLastReply: this.calculateDaysSince(
        props.hs_sales_email_last_replied,
        now,
      ),
      totalContactAttempts: this.parseNumericProperty(props.num_contacted_notes),
      leadScore: this.parseNumericProperty(props.hubspotscore),
      dealValue: this.parseNumericProperty(props.hs_deal_amount),
    };
  }

  /**
   * Calculate days since a date string
   */
  private calculateDaysSince(dateStr: string | undefined, now: Date): number | null {
    if (!dateStr || dateStr.trim() === '') {
      return null;
    }

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return null;
    }

    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return diffDays;
  }

  /**
   * Calculate factor score based on days since engagement (0-100)
   * Higher days = higher dormancy score
   */
  private calculateFactorScore(days: number | null): number {
    if (days === null) {
      return 100; // No data means maximum dormancy
    }

    if (days <= 0) {
      return 0; // Recent/future engagement means no dormancy
    }

    // Linear scaling with cap
    const cappedDays = Math.min(days, MAX_DAYS_FOR_SCORING);
    return Math.min((cappedDays / MAX_DAYS_FOR_SCORING) * 100, 100);
  }

  /**
   * Calculate email engagement score from open and click data
   * Only considers factors that have actual data
   */
  private calculateEmailEngagementScore(
    daysSinceOpen: number | null,
    daysSinceClick: number | null,
  ): number {
    const hasOpen = daysSinceOpen !== null;
    const hasClick = daysSinceClick !== null;

    if (!hasOpen && !hasClick) {
      return 100; // No email engagement data = high dormancy
    }

    if (hasOpen && hasClick) {
      // Both available - weight clicks higher
      const openScore = this.calculateFactorScore(daysSinceOpen);
      const clickScore = this.calculateFactorScore(daysSinceClick);
      return openScore * 0.4 + clickScore * 0.6;
    }

    if (hasOpen) {
      return this.calculateFactorScore(daysSinceOpen);
    }

    return this.calculateFactorScore(daysSinceClick);
  }

  /**
   * Calculate total weighted dormancy score
   */
  private calculateTotalScore(factors: {
    lastContactScore: number;
    emailEngagementScore: number;
    websiteEngagementScore: number;
    hasAnyData: boolean;
    hasLastContact: boolean;
    hasEmailEngagement: boolean;
    hasWebsiteEngagement: boolean;
  }): number {
    if (!factors.hasAnyData) {
      // No engagement data at all = highly dormant
      return 90;
    }

    // Only include factors that have actual data in the weighted average
    let weightedScore = 0;
    let totalWeight = 0;

    if (factors.hasLastContact) {
      weightedScore += factors.lastContactScore * WEIGHTS.lastContact;
      totalWeight += WEIGHTS.lastContact;
    }

    if (factors.hasEmailEngagement) {
      weightedScore += factors.emailEngagementScore * WEIGHTS.emailEngagement;
      totalWeight += WEIGHTS.emailEngagement;
    }

    if (factors.hasWebsiteEngagement) {
      weightedScore += factors.websiteEngagementScore * WEIGHTS.websiteEngagement;
      totalWeight += WEIGHTS.websiteEngagement;
    }

    if (totalWeight === 0) {
      return 90; // No actual engagement data
    }

    // Normalize to 0-100 scale
    return Math.min(weightedScore / totalWeight, 100);
  }

  /**
   * Calculate composite priority score (0-100)
   * Considers dormancy, lead quality, and deal value
   */
  private calculatePriorityScore(factors: {
    dormancyScore: number;
    leadScore: number;
    dealValue: number;
  }): number {
    // Normalize deal value (assume max of 1M for scoring)
    const normalizedDealValue = Math.min(factors.dealValue / 1000000, 1) * 100;

    const score =
      factors.dormancyScore * 0.4 +
      factors.leadScore * 0.35 +
      normalizedDealValue * 0.25;

    return Math.round(score * 100) / 100;
  }

  /**
   * Sort contacts based on prioritization options
   */
  private sortContacts(
    contacts: PrioritizedContact[],
    options: PrioritizationOptions,
  ): void {
    const multiplier = options.sortOrder === 'desc' ? -1 : 1;

    contacts.sort((a, b) => {
      let compareValue: number;

      switch (options.sortBy) {
        case 'dormancyScore':
          compareValue = a.dormancyScore.totalScore - b.dormancyScore.totalScore;
          break;
        case 'leadScore':
          compareValue = a.leadScore - b.leadScore;
          break;
        case 'dealValue':
          compareValue = a.dealValue - b.dealValue;
          break;
        case 'recency':
          const aTime = a.lastEngagementDate?.getTime() ?? 0;
          const bTime = b.lastEngagementDate?.getTime() ?? 0;
          compareValue = aTime - bTime;
          break;
        case 'composite':
        default:
          compareValue = a.priorityScore - b.priorityScore;
          break;
      }

      return compareValue * multiplier;
    });
  }

  /**
   * Get the most recent engagement date from contact
   */
  private getLastEngagementDate(contact: HubSpotContact): Date | null {
    const dateFields = [
      contact.properties.notes_last_contacted,
      contact.properties.hs_email_last_open_date,
      contact.properties.hs_email_last_click_date,
      contact.properties.hs_analytics_last_visit_timestamp,
      contact.properties.hs_sales_email_last_replied,
    ];

    const validDates = dateFields
      .filter((d) => d && d.trim() !== '')
      .map((d) => new Date(d!))
      .filter((d) => !isNaN(d.getTime()));

    if (validDates.length === 0) {
      return null;
    }

    return new Date(Math.max(...validDates.map((d) => d.getTime())));
  }

  /**
   * Parse a numeric property from string
   */
  private parseNumericProperty(value: string | undefined): number {
    if (!value || value.trim() === '') {
      return 0;
    }

    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Calculate distribution across high/medium/low levels
   */
  private calculateDistribution(
    values: number[],
    thresholds: { high: number; medium: number },
  ): LevelDistribution {
    return {
      high: values.filter((v) => v >= thresholds.high).length,
      medium: values.filter((v) => v >= thresholds.medium && v < thresholds.high)
        .length,
      low: values.filter((v) => v < thresholds.medium).length,
    };
  }
}
