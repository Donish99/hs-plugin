import { Injectable, Logger } from '@nestjs/common';
import { Client } from '@hubspot/api-client';
import { FilterOperatorEnum } from '@hubspot/api-client/lib/codegen/crm/contacts';
import { OAuthService } from './oauth.service';

export interface HubspotContact {
  id: string;
  properties: Record<string, string | null>;
  createdAt: string;
  updatedAt: string;
}

export interface ContactFilter {
  propertyName: string;
  operator: string;
  value: string;
}

export interface GetContactsOptions {
  limit?: number;
  cursor?: string;
  fetchAll?: boolean;
  properties?: string[];
}

export interface DormantContactsOptions {
  excludeRecentEmailOpens?: boolean;
  emailOpenDays?: number;
  excludeRecentClicks?: boolean;
  clickDays?: number;
}

export interface SearchResult {
  contacts: HubspotContact[];
  total: number;
}

interface FetchPageResult {
  contacts: HubspotContact[];
  nextCursor?: string;
}

const DEFAULT_PROPERTIES = [
  'email',
  'firstname',
  'lastname',
  'company',
  'jobtitle',
  'phone',
  'notes_last_contacted',
  'hs_email_last_open_date',
  'hs_email_last_click_date',
  'hs_analytics_last_visit_timestamp',
  'hs_lead_status',
  'lifecyclestage',
  'hs_sales_email_last_replied',
  'num_contacted_notes',
];

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

@Injectable()
export class ContactsService {
  private readonly logger = new Logger(ContactsService.name);

  constructor(private readonly oauthService: OAuthService) {}

  /**
   * Get contacts from HubSpot with optional pagination
   */
  async getContacts(portalId: number, options: GetContactsOptions = {}): Promise<HubspotContact[]> {
    if (portalId < 0) {
      throw new Error('Invalid portal ID');
    }

    const accessToken = await this.oauthService.getValidAccessToken(portalId);
    const properties = options.properties || DEFAULT_PROPERTIES;
    const limit = options.limit || 100;
    const allContacts: HubspotContact[] = [];
    let cursor = options.cursor;
    let retryCount = 0;

    do {
      try {
        const result = await this.fetchContactsPage(accessToken, {
          properties,
          limit: Math.min(limit - allContacts.length, 100),
          after: cursor,
        });

        allContacts.push(...result.contacts);
        cursor = result.nextCursor;
        retryCount = 0; // Reset retry count on success

        // Stop if we've reached the limit or no more results
        if (!options.fetchAll || allContacts.length >= limit || !cursor) {
          break;
        }
      } catch (error: any) {
        if (error?.code === 429) {
          if (retryCount >= MAX_RETRIES) {
            throw new Error('Rate limit exceeded after max retries');
          }
          retryCount++;
          const delayMs = BASE_DELAY_MS * Math.pow(2, retryCount - 1);
          this.logger.warn(
            `Rate limit hit, retrying in ${delayMs}ms (attempt ${retryCount}/${MAX_RETRIES})`,
          );
          await this.delay(delayMs);
        } else {
          // Non-rate-limit errors should be thrown immediately
          throw error;
        }
      }
    } while (true);

    return allContacts;
  }

  /**
   * Get a single contact by ID
   */
  async getContactById(portalId: number, contactId: string): Promise<HubspotContact | null> {
    const accessToken = await this.oauthService.getValidAccessToken(portalId);
    return this.fetchContactById(accessToken, contactId);
  }

  /**
   * Search contacts with filters
   */
  async searchContacts(
    portalId: number,
    filters: ContactFilter[],
    options: { limit?: number } = {},
  ): Promise<SearchResult> {
    const accessToken = await this.oauthService.getValidAccessToken(portalId);

    return this.executeSearch(accessToken, {
      filterGroups: [
        {
          filters: filters.map((f) => ({
            propertyName: f.propertyName,
            operator: f.operator,
            value: f.value,
          })),
        },
      ],
      properties: DEFAULT_PROPERTIES,
      limit: options.limit || 100,
    });
  }

  /**
   * Search contacts with a full search request object
   * Used by scanner service for advanced queries
   */
  async searchWithRequest(
    portalId: number,
    searchRequest: {
      filterGroups: Array<{
        filters: Array<{
          propertyName: string;
          operator: string;
          value: string;
        }>;
      }>;
      properties: string[];
      limit: number;
      after?: string;
    },
  ): Promise<SearchResult> {
    const accessToken = await this.oauthService.getValidAccessToken(portalId);
    return this.executeSearch(accessToken, searchRequest);
  }

  /**
   * Get dormant contacts based on inactivity period
   */
  async getDormantContacts(
    portalId: number,
    daysInactive: number,
    options: DormantContactsOptions = {},
  ): Promise<HubspotContact[]> {
    const accessToken = await this.oauthService.getValidAccessToken(portalId);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysInactive);
    const cutoffTimestamp = cutoffDate.toISOString().split('T')[0];

    const filters: any[] = [
      {
        propertyName: 'notes_last_contacted',
        operator: 'LT',
        value: cutoffTimestamp,
      },
    ];

    if (options.excludeRecentEmailOpens && options.emailOpenDays) {
      const emailOpenCutoff = new Date();
      emailOpenCutoff.setDate(emailOpenCutoff.getDate() - options.emailOpenDays);
      filters.push({
        propertyName: 'hs_email_last_open_date',
        operator: 'LT',
        value: emailOpenCutoff.toISOString().split('T')[0],
      });
    }

    const result = await this.executeSearch(accessToken, {
      filterGroups: [{ filters }],
      properties: DEFAULT_PROPERTIES,
      limit: 100,
    });

    return result.contacts;
  }

  /**
   * Fetch a page of contacts from HubSpot
   */
  private async fetchContactsPage(
    accessToken: string,
    options: {
      properties: string[];
      limit: number;
      after?: string;
    },
  ): Promise<FetchPageResult> {
    const client = new Client({ accessToken });

    try {
      const response = await client.crm.contacts.basicApi.getPage(
        options.limit,
        options.after,
        options.properties,
      );

      const contacts: HubspotContact[] = response.results.map((contact) => ({
        id: contact.id,
        properties: contact.properties as Record<string, string | null>,
        createdAt: contact.createdAt.toISOString(),
        updatedAt: contact.updatedAt.toISOString(),
      }));

      return {
        contacts,
        nextCursor: response.paging?.next?.after,
      };
    } catch (error) {
      this.logger.error('Failed to fetch contacts page', error);
      throw error;
    }
  }

  /**
   * Fetch a single contact by ID
   */
  private async fetchContactById(
    accessToken: string,
    contactId: string,
  ): Promise<HubspotContact | null> {
    const client = new Client({ accessToken });

    try {
      const response = await client.crm.contacts.basicApi.getById(contactId, DEFAULT_PROPERTIES);

      return {
        id: response.id,
        properties: response.properties as Record<string, string | null>,
        createdAt: response.createdAt.toISOString(),
        updatedAt: response.updatedAt.toISOString(),
      };
    } catch (error: any) {
      if (error?.code === 404) {
        return null;
      }
      this.logger.error(`Failed to fetch contact ${contactId}`, error);
      throw error;
    }
  }

  /**
   * Execute a search query against HubSpot
   */
  private async executeSearch(
    accessToken: string,
    searchRequest: {
      filterGroups: Array<{
        filters: Array<{
          propertyName: string;
          operator: string;
          value: string;
        }>;
      }>;
      properties: string[];
      limit: number;
    },
  ): Promise<SearchResult> {
    const client = new Client({ accessToken });

    try {
      // Convert string operators to enum values
      const typedFilterGroups = searchRequest.filterGroups.map((group) => ({
        filters: group.filters.map((filter) => ({
          propertyName: filter.propertyName,
          operator: filter.operator as FilterOperatorEnum,
          value: filter.value,
        })),
      }));

      const response = await client.crm.contacts.searchApi.doSearch({
        filterGroups: typedFilterGroups,
        properties: searchRequest.properties,
        limit: searchRequest.limit,
        after: '0',
        sorts: [],
      });

      const contacts: HubspotContact[] = response.results.map((contact) => ({
        id: contact.id,
        properties: contact.properties as Record<string, string | null>,
        createdAt: contact.createdAt.toISOString(),
        updatedAt: contact.updatedAt.toISOString(),
      }));

      return {
        contacts,
        total: response.total,
      };
    } catch (error) {
      this.logger.error('Failed to search contacts', error);
      throw error;
    }
  }

  /**
   * Delay utility for rate limiting
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get a single contact by ID with extended properties
   * Alias for getContactById with additional properties for AI context
   */
  async getContact(
    accountId: string,
    portalId: number,
    contactId: string,
  ): Promise<HubspotContact | null> {
    const accessToken = await this.oauthService.getValidAccessToken(portalId);
    const client = new Client({ accessToken });

    const extendedProperties = [
      ...DEFAULT_PROPERTIES,
      'hubspotscore',
      'industry',
      'annualrevenue',
      'numberofemployees',
    ];

    try {
      const response = await client.crm.contacts.basicApi.getById(contactId, extendedProperties);

      return {
        id: response.id,
        properties: response.properties as Record<string, string | null>,
        createdAt: response.createdAt.toISOString(),
        updatedAt: response.updatedAt.toISOString(),
      };
    } catch (error: any) {
      if (error?.code === 404) {
        return null;
      }
      this.logger.error(`Failed to fetch contact ${contactId}`, error);
      throw error;
    }
  }

  /**
   * Get deals associated with a contact
   */
  async getContactDeals(
    accountId: string,
    portalId: number,
    contactId: string,
  ): Promise<Array<{ id: string; properties: Record<string, string> }>> {
    const accessToken = await this.oauthService.getValidAccessToken(portalId);
    const client = new Client({ accessToken });

    try {
      const response = await client.crm.associations.v4.basicApi.getPage(
        'contacts',
        contactId,
        'deals',
        undefined,
        10,
      );

      if (!response.results || response.results.length === 0) {
        return [];
      }

      // Fetch deal details for each associated deal
      const dealIds = response.results.map((r: { toObjectId: string }) => r.toObjectId);
      const deals = await Promise.all(
        dealIds.slice(0, 10).map(async (dealId: string) => {
          try {
            const deal = await client.crm.deals.basicApi.getById(dealId, [
              'dealname',
              'dealstage',
              'amount',
              'closedate',
              'pipeline',
            ]);
            return {
              id: deal.id,
              properties: deal.properties as Record<string, string>,
            };
          } catch (error) {
            this.logger.warn(`Failed to fetch deal ${dealId}`, error);
            return null;
          }
        }),
      );

      return deals.filter(
        (d): d is { id: string; properties: Record<string, string> } => d !== null,
      );
    } catch (error) {
      this.logger.error(`Failed to fetch deals for contact ${contactId}`, error);
      return [];
    }
  }

  /**
   * Get email engagements for a contact
   */
  async getContactEmails(
    accountId: string,
    portalId: number,
    contactId: string,
  ): Promise<Array<{ id: string; properties: Record<string, string> }>> {
    const accessToken = await this.oauthService.getValidAccessToken(portalId);
    const client = new Client({ accessToken });

    try {
      const response = await client.crm.associations.v4.basicApi.getPage(
        'contacts',
        contactId,
        'emails',
        undefined,
        20,
      );

      if (!response.results || response.results.length === 0) {
        return [];
      }

      // Fetch email details for recent emails
      const emailIds = response.results.map((r: { toObjectId: string }) => r.toObjectId);
      const emails = await Promise.all(
        emailIds.slice(0, 20).map(async (emailId: string) => {
          try {
            const email = await client.crm.objects.emails.basicApi.getById(emailId, [
              'hs_email_subject',
              'hs_timestamp',
              'hs_email_direction',
            ]);
            return {
              id: email.id,
              properties: email.properties as Record<string, string>,
            };
          } catch (error) {
            this.logger.warn(`Failed to fetch email ${emailId}`, error);
            return null;
          }
        }),
      );

      return emails.filter(
        (e): e is { id: string; properties: Record<string, string> } => e !== null,
      );
    } catch (error) {
      this.logger.error(`Failed to fetch emails for contact ${contactId}`, error);
      return [];
    }
  }

  /**
   * Get email content by email ID
   * Used to retrieve reply content for classification
   */
  async getEmailContent(
    portalId: number,
    emailId: string,
  ): Promise<{ subject: string; body: string } | null> {
    const accessToken = await this.oauthService.getValidAccessToken(portalId);
    const client = new Client({ accessToken });

    try {
      const email = await client.crm.objects.emails.basicApi.getById(emailId, [
        'hs_email_subject',
        'hs_email_text',
        'hs_email_html',
      ]);

      return {
        subject: email.properties['hs_email_subject'] || '',
        body: email.properties['hs_email_text'] || email.properties['hs_email_html'] || '',
      };
    } catch (error) {
      this.logger.error(`Failed to fetch email content for ${emailId}`, error);
      return null;
    }
  }

  /**
   * Get company associated with a contact
   */
  async getContactCompany(
    accountId: string,
    portalId: number,
    contactId: string,
  ): Promise<{ id: string; properties: Record<string, string> } | null> {
    const accessToken = await this.oauthService.getValidAccessToken(portalId);
    const client = new Client({ accessToken });

    try {
      const response = await client.crm.associations.v4.basicApi.getPage(
        'contacts',
        contactId,
        'companies',
        undefined,
        1,
      );

      if (!response.results || response.results.length === 0) {
        return null;
      }

      const companyId = (response.results[0] as { toObjectId: string }).toObjectId;
      const company = await client.crm.companies.basicApi.getById(companyId, [
        'name',
        'industry',
        'annualrevenue',
        'numberofemployees',
        'domain',
      ]);

      return {
        id: company.id,
        properties: company.properties as Record<string, string>,
      };
    } catch (error) {
      this.logger.error(`Failed to fetch company for contact ${contactId}`, error);
      return null;
    }
  }
}
