import { Injectable, Logger } from '@nestjs/common';
import { DormancyCriteria } from '../../entities/dormancy-rule.entity';
import * as crypto from 'crypto';

export interface HubspotFilter {
  propertyName: string;
  operator: string;
  value?: string;  // Optional for operators like NOT_HAS_PROPERTY
}

export interface HubspotFilterGroup {
  filters: HubspotFilter[];
}

export interface HubspotSearchRequest {
  filterGroups: HubspotFilterGroup[];
  properties: string[];
  limit: number;
  after?: string;
  sorts?: Array<{ propertyName: string; direction: 'ASCENDING' | 'DESCENDING' }>;
}

export interface SearchOptions {
  limit?: number;
  after?: string;
  additionalProperties?: string[];
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
  'hubspotscore',
  'hs_sales_email_last_replied',
  'num_contacted_notes',
  'associatedcompanyid',
];

const DEFAULT_LIMIT = 100;

@Injectable()
export class QueryBuilderService {
  private readonly logger = new Logger(QueryBuilderService.name);

  /**
   * Build HubSpot filter groups from dormancy criteria
   *
   * IMPORTANT: For date-based "dormancy" criteria, we need to match contacts that either:
   * 1. Have a date value that is older than the threshold (LT filter)
   * 2. Have never had that property set (NOT_HAS_PROPERTY filter)
   *
   * This requires OR logic, which in HubSpot means separate filter groups.
   */
  buildFiltersFromCriteria(criteria: DormancyCriteria): HubspotFilterGroup[] {
    // Collect non-date filters that apply to ALL results (AND logic)
    const commonFilters: HubspotFilter[] = [];

    // Lead score filter (GTE = "greater than or equal")
    if (criteria.min_lead_score !== undefined) {
      commonFilters.push({
        propertyName: 'hubspotscore',
        operator: 'GTE',
        value: String(criteria.min_lead_score),
      });
    }

    // Exclusion tags - add NOT_CONTAINS_TOKEN for each tag
    if (criteria.exclude_tags && criteria.exclude_tags.length > 0) {
      for (const tag of criteria.exclude_tags) {
        commonFilters.push({
          propertyName: 'hs_tag',
          operator: 'NOT_CONTAINS_TOKEN',
          value: tag,
        });
      }
    }

    // Build date-based dormancy filter groups
    // Each date criterion creates filter groups that match EITHER old dates OR null values
    const dateFilterGroups = this.buildDateFilterGroups(criteria, commonFilters);

    // Handle deal stages - they use OR logic between stages
    if (criteria.deal_stages && criteria.deal_stages.length > 0) {
      if (dateFilterGroups.length === 0 && commonFilters.length === 0) {
        // Only deal stages, no other criteria
        return criteria.deal_stages.map((stage) => ({
          filters: [
            {
              propertyName: 'dealstage',
              operator: 'EQ',
              value: stage,
            },
          ],
        }));
      }

      // Combine with deal stages
      const baseGroups = dateFilterGroups.length > 0 ? dateFilterGroups : [{ filters: commonFilters }];
      const result: HubspotFilterGroup[] = [];

      for (const stage of criteria.deal_stages) {
        for (const group of baseGroups) {
          result.push({
            filters: [
              ...group.filters,
              {
                propertyName: 'dealstage',
                operator: 'EQ',
                value: stage,
              },
            ],
          });
        }
      }
      return result;
    }

    // Return date filter groups if we have them
    if (dateFilterGroups.length > 0) {
      return dateFilterGroups;
    }

    // If only common filters, return single group
    if (commonFilters.length > 0) {
      return [{ filters: commonFilters }];
    }

    // No filters at all - return empty
    return [];
  }

  /**
   * Build filter groups for date-based dormancy criteria
   *
   * For each date criterion, we need to match contacts where EITHER:
   * - The date property is older than threshold (property < cutoff_date)
   * - The date property has never been set (NOT_HAS_PROPERTY)
   *
   * This captures truly dormant contacts who may have never been contacted.
   */
  private buildDateFilterGroups(
    criteria: DormancyCriteria,
    commonFilters: HubspotFilter[],
  ): HubspotFilterGroup[] {
    // Define date criteria with their property names
    const dateCriteria: Array<{ property: string; days: number | undefined }> = [
      { property: 'notes_last_contacted', days: criteria.min_days_inactive },
      { property: 'hs_email_last_open_date', days: criteria.no_email_opens_days },
      { property: 'hs_email_last_click_date', days: criteria.no_email_clicks_days },
      { property: 'hs_analytics_last_visit_timestamp', days: criteria.no_website_visits_days },
    ];

    // Filter to only active criteria
    const activeDateCriteria = dateCriteria.filter((c) => c.days !== undefined);

    if (activeDateCriteria.length === 0) {
      return [];
    }

    // For simplicity, we'll use the primary criterion (min_days_inactive) with OR for null
    // and AND the other criteria as additional filters
    // This avoids exponential growth of filter groups

    const primaryCriterion = activeDateCriteria[0];
    const additionalCriteria = activeDateCriteria.slice(1);

    // Build additional date filters (these will be ANDed)
    const additionalDateFilters: HubspotFilter[] = additionalCriteria.map((c) => ({
      propertyName: c.property,
      operator: 'LT',
      value: this.getDateDaysAgo(c.days!),
    }));

    const allCommonFilters = [...commonFilters, ...additionalDateFilters];

    // Create two filter groups for the primary criterion:
    // Group 1: Property has old value (LT)
    // Group 2: Property doesn't exist (NOT_HAS_PROPERTY)
    const filterGroups: HubspotFilterGroup[] = [
      {
        // Contacts with old last contact date
        filters: [
          ...allCommonFilters,
          {
            propertyName: primaryCriterion.property,
            operator: 'LT',
            value: this.getDateDaysAgo(primaryCriterion.days!),
          },
        ],
      },
      {
        // Contacts who have never been contacted (null value)
        filters: [
          ...allCommonFilters,
          {
            propertyName: primaryCriterion.property,
            operator: 'NOT_HAS_PROPERTY',
            // No value field for NOT_HAS_PROPERTY operator
          },
        ],
      },
    ];

    this.logger.debug(
      `Built ${filterGroups.length} filter groups for dormancy criteria ` +
      `(primary: ${primaryCriterion.property} < ${primaryCriterion.days} days)`,
    );

    return filterGroups;
  }

  /**
   * Build a complete HubSpot search request
   */
  buildSearchRequest(
    criteria: DormancyCriteria,
    options: SearchOptions = {},
  ): HubspotSearchRequest {
    const filterGroups = this.buildFiltersFromCriteria(criteria);

    const properties = [...DEFAULT_PROPERTIES, ...(options.additionalProperties || [])];

    // Remove duplicates
    const uniqueProperties = [...new Set(properties)];

    const request: HubspotSearchRequest = {
      filterGroups,
      properties: uniqueProperties,
      limit: options.limit || DEFAULT_LIMIT,
      sorts: [{ propertyName: 'notes_last_contacted', direction: 'ASCENDING' }],
    };

    if (options.after) {
      request.after = options.after;
    }

    return request;
  }

  /**
   * Build filter groups for deal stage matching
   * Deal stages use OR logic - contact matches if in ANY of the specified stages
   */
  buildDealStageFilters(dealStages: string[]): HubspotFilterGroup[] {
    if (!dealStages || dealStages.length === 0) {
      return [];
    }

    // Each stage gets its own filter group for OR logic
    return dealStages.map((stage) => ({
      filters: [
        {
          propertyName: 'dealstage',
          operator: 'EQ',
          value: stage,
        },
      ],
    }));
  }

  /**
   * Generate a cache key for a search query
   */
  getCacheKey(accountId: string, criteria: DormancyCriteria): string {
    const criteriaStr = JSON.stringify(criteria, Object.keys(criteria).sort());
    const hash = crypto.createHash('md5').update(criteriaStr).digest('hex').substring(0, 12);

    return `dormancy:${accountId}:${hash}`;
  }

  /**
   * Get ISO date string for X days ago
   */
  private getDateDaysAgo(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().split('T')[0];
  }

  /**
   * Merge multiple filter groups (for combining criteria with deal stages)
   */
  mergeFilterGroups(
    criteriaFilters: HubspotFilterGroup[],
    dealStageFilters: HubspotFilterGroup[],
  ): HubspotFilterGroup[] {
    if (criteriaFilters.length === 0) {
      return dealStageFilters;
    }

    if (dealStageFilters.length === 0) {
      return criteriaFilters;
    }

    // Combine: each deal stage filter group gets the criteria filters added
    // This creates AND between criteria and OR between deal stages
    return dealStageFilters.map((dealGroup) => ({
      filters: [...criteriaFilters[0].filters, ...dealGroup.filters],
    }));
  }
}
