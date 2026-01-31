import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { ContactsService } from '../../hubspot/services/contacts.service';

export interface EmailHistoryEntry {
  subject: string;
  date: Date;
}

export interface ContactContext {
  contactId: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  jobTitle?: string;
  industry?: string;
  lastContactDate?: Date;
  daysSinceContact?: number;
  leadScore?: number;
  dealName?: string;
  dealStage?: string;
  dealAmount?: number;
  emailHistory: EmailHistoryEntry[];
  previousInterests: string[];
  companySize?: number;
  annualRevenue?: number;
}

/**
 * Service for gathering and caching contact context from HubSpot
 * Used to provide AI with relevant information for personalized message generation
 */
@Injectable()
export class ContextService {
  private readonly logger = new Logger(ContextService.name);
  private readonly cacheTTL = 3600; // 1 hour
  private readonly maxEmailHistory = 10;

  constructor(
    private readonly contactsService: ContactsService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  /**
   * Get complete context for a contact, with caching
   */
  async getContactContext(
    accountId: string,
    portalId: number,
    contactId: string,
    forceRefresh = false,
  ): Promise<ContactContext> {
    const cacheKey = this.getCacheKey(accountId, contactId);

    // Check cache first unless force refresh
    if (!forceRefresh) {
      const cached = await this.cacheManager.get<ContactContext>(cacheKey);
      if (cached) {
        this.logger.debug(`Cache hit for contact ${contactId}`);
        return cached;
      }
    }

    // Fetch fresh data from HubSpot
    const context = await this.fetchContactContext(accountId, portalId, contactId);

    // Cache the result
    await this.cacheManager.set(cacheKey, context, this.cacheTTL);

    return context;
  }

  /**
   * Get contexts for multiple contacts
   */
  async getMultipleContactContexts(
    accountId: string,
    portalId: number,
    contactIds: string[],
  ): Promise<ContactContext[]> {
    const results: ContactContext[] = [];

    for (const contactId of contactIds) {
      try {
        const context = await this.getContactContext(accountId, portalId, contactId);
        results.push(context);
      } catch (error) {
        this.logger.warn(`Failed to get context for contact ${contactId}: ${error}`);
        // Continue with other contacts
      }
    }

    return results;
  }

  /**
   * Invalidate cached context for a contact
   */
  async invalidateCache(accountId: string, contactId: string): Promise<void> {
    const cacheKey = this.getCacheKey(accountId, contactId);
    await this.cacheManager.del(cacheKey);
    this.logger.debug(`Cache invalidated for contact ${contactId}`);
  }

  /**
   * Build a formatted string for use in AI prompts
   */
  buildContextForPrompt(context: ContactContext): string {
    const lines: string[] = [];

    // Name
    const name = [context.firstName, context.lastName].filter(Boolean).join(' ');
    if (name) {
      lines.push(`Contact: ${name}`);
    }

    // Company info
    if (context.company) {
      lines.push(`Company: ${context.company}`);
    }
    if (context.jobTitle) {
      lines.push(`Title: ${context.jobTitle}`);
    }
    if (context.industry) {
      lines.push(`Industry: ${context.industry}`);
    }

    // Engagement info
    if (context.daysSinceContact !== undefined) {
      lines.push(`Days since last contact: ${context.daysSinceContact}`);
    }
    if (context.leadScore !== undefined) {
      lines.push(`Lead score: ${context.leadScore}`);
    }

    // Deal info
    if (context.dealName) {
      lines.push(`Deal: ${context.dealName} (${context.dealStage || 'unknown stage'})`);
      if (context.dealAmount) {
        lines.push(`Deal value: $${context.dealAmount.toLocaleString()}`);
      }
    }

    // Email history
    if (context.emailHistory.length > 0) {
      lines.push(`Recent email subjects: ${context.emailHistory.map((e) => e.subject).join(', ')}`);
    }

    // Previous interests
    if (context.previousInterests.length > 0) {
      lines.push(`Previous interests: ${context.previousInterests.join(', ')}`);
    }

    return lines.join('\n');
  }

  /**
   * Fetch fresh contact context from HubSpot
   */
  private async fetchContactContext(
    accountId: string,
    portalId: number,
    contactId: string,
  ): Promise<ContactContext> {
    // Fetch contact details
    const contact = await this.contactsService.getContact(accountId, portalId, contactId);

    if (!contact) {
      throw new NotFoundException('Contact not found');
    }

    const props = contact.properties || {};

    // Fetch associated deals
    let deals: any[] = [];
    try {
      deals = await this.contactsService.getContactDeals(accountId, portalId, contactId);
    } catch (error) {
      this.logger.warn(`Failed to fetch deals for contact ${contactId}: ${error}`);
    }

    // Fetch email history
    let emails: any[] = [];
    try {
      emails = await this.contactsService.getContactEmails(accountId, portalId, contactId);
    } catch (error) {
      this.logger.warn(`Failed to fetch emails for contact ${contactId}: ${error}`);
    }

    // Parse last contact date
    const lastContactDate = props.notes_last_contacted
      ? new Date(props.notes_last_contacted)
      : undefined;

    // Calculate days since contact
    let daysSinceContact: number | undefined;
    if (lastContactDate && !isNaN(lastContactDate.getTime())) {
      const now = new Date();
      daysSinceContact = Math.floor(
        (now.getTime() - lastContactDate.getTime()) / (1000 * 60 * 60 * 24),
      );
    }

    // Parse lead score
    let leadScore: number | undefined;
    if (props.hubspotscore) {
      const parsed = parseInt(props.hubspotscore, 10);
      if (!isNaN(parsed)) {
        leadScore = parsed;
      }
    }

    // Get primary deal (most recent or highest value)
    const primaryDeal = this.selectPrimaryDeal(deals);

    // Build email history
    const emailHistory = this.buildEmailHistory(emails);

    // Extract interests from email subjects
    const previousInterests = this.extractInterests(emailHistory);

    return {
      contactId,
      firstName: props.firstname || undefined,
      lastName: props.lastname || undefined,
      company: props.company || undefined,
      jobTitle: props.jobtitle || undefined,
      industry: props.industry || undefined,
      lastContactDate,
      daysSinceContact,
      leadScore,
      dealName: primaryDeal?.properties?.dealname || undefined,
      dealStage: primaryDeal?.properties?.dealstage || undefined,
      dealAmount: primaryDeal?.properties?.amount
        ? parseFloat(primaryDeal.properties.amount)
        : undefined,
      emailHistory,
      previousInterests,
      companySize: props.numberofemployees ? parseInt(props.numberofemployees, 10) : undefined,
      annualRevenue: props.annualrevenue ? parseFloat(props.annualrevenue) : undefined,
    };
  }

  /**
   * Select the primary deal (most relevant for context)
   */
  private selectPrimaryDeal(deals: any[]): any | undefined {
    if (!deals || deals.length === 0) {
      return undefined;
    }

    // Sort by amount descending, then by most recent
    return deals.sort((a, b) => {
      const amountA = parseFloat(a.properties?.amount || '0');
      const amountB = parseFloat(b.properties?.amount || '0');
      return amountB - amountA;
    })[0];
  }

  /**
   * Build email history from HubSpot email records
   */
  private buildEmailHistory(emails: any[]): EmailHistoryEntry[] {
    if (!emails || emails.length === 0) {
      return [];
    }

    return emails
      .filter((e) => e.properties?.hs_email_subject)
      .sort((a, b) => {
        const dateA = new Date(a.properties?.hs_timestamp || 0);
        const dateB = new Date(b.properties?.hs_timestamp || 0);
        return dateB.getTime() - dateA.getTime();
      })
      .slice(0, this.maxEmailHistory)
      .map((e) => ({
        subject: e.properties.hs_email_subject,
        date: new Date(e.properties.hs_timestamp),
      }));
  }

  /**
   * Extract likely interests from email subjects
   */
  private extractInterests(emailHistory: EmailHistoryEntry[]): string[] {
    if (emailHistory.length === 0) {
      return [];
    }

    // Common keywords to extract as interests
    const interestKeywords = [
      'demo',
      'trial',
      'pricing',
      'integration',
      'api',
      'enterprise',
      'security',
      'compliance',
      'features',
      'support',
      'onboarding',
      'migration',
      'upgrade',
      'discount',
      'contract',
      'renewal',
    ];

    const foundInterests = new Set<string>();

    for (const entry of emailHistory) {
      const subjectLower = entry.subject.toLowerCase();
      for (const keyword of interestKeywords) {
        if (subjectLower.includes(keyword)) {
          foundInterests.add(keyword);
        }
      }
    }

    return Array.from(foundInterests);
  }

  /**
   * Generate cache key for contact context
   */
  private getCacheKey(accountId: string, contactId: string): string {
    return `contact-context:${accountId}:${contactId}`;
  }
}
