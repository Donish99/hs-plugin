import { Injectable, Logger } from '@nestjs/common';
import { DormancyCriteria } from '../../entities/dormancy-rule.entity';
import * as crypto from 'crypto';

export interface HubspotFilter {
  propertyName: string;
  operator: string;
  value: string;
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
   */
  buildFiltersFromCriteria(criteria: DormancyCriteria): HubspotFilterGroup[] {
    const filters: HubspotFilter[] = [];

    // Time-based filters (all use LT = "less than" for dates in the past)
    if (criteria.min_days_inactive !== undefined) {
      filters.push({
        propertyName: 'notes_last_contacted',
        operator: 'LT',
        value: this.getDateDaysAgo(criteria.min_days_inactive),
      });
    }

    if (criteria.no_email_opens_days !== undefined) {
      filters.push({
        propertyName: 'hs_email_last_open_date',
        operator: 'LT',
        value: this.getDateDaysAgo(criteria.no_email_opens_days),
      });
    }

    if (criteria.no_email_clicks_days !== undefined) {
      filters.push({
        propertyName: 'hs_email_last_click_date',
        operator: 'LT',
        value: this.getDateDaysAgo(criteria.no_email_clicks_days),
      });
    }

    if (criteria.no_website_visits_days !== undefined) {
      filters.push({
        propertyName: 'hs_analytics_last_visit_timestamp',
        operator: 'LT',
        value: this.getDateDaysAgo(criteria.no_website_visits_days),
      });
    }

    // Lead score filter (GTE = "greater than or equal")
    if (criteria.min_lead_score !== undefined) {
      filters.push({
        propertyName: 'hubspotscore',
        operator: 'GTE',
        value: String(criteria.min_lead_score),
      });
    }

    // Exclusion tags - add NOT_CONTAINS_TOKEN for each tag
    if (criteria.exclude_tags && criteria.exclude_tags.length > 0) {
      for (const tag of criteria.exclude_tags) {
        filters.push({
          propertyName: 'hs_tag',
          operator: 'NOT_CONTAINS_TOKEN',
          value: tag,
        });
      }
    }

    // Handle deal stages - they use OR logic between stages
    // If deal stages specified, we need separate filter groups
    if (criteria.deal_stages && criteria.deal_stages.length > 0) {
      if (filters.length === 0) {
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

      // Combine criteria filters with each deal stage (AND within group, OR between groups)
      return criteria.deal_stages.map((stage) => ({
        filters: [
          ...filters,
          {
            propertyName: 'dealstage',
            operator: 'EQ',
            value: stage,
          },
        ],
      }));
    }

    // If no filters at all, return empty array
    if (filters.length === 0) {
      return [];
    }

    // All other filters use AND logic (same filter group)
    return [{ filters }];
  }

  /**
   * Build a complete HubSpot search request
   */
  buildSearchRequest(
    criteria: DormancyCriteria,
    options: SearchOptions = {},
  ): HubspotSearchRequest {
    const filterGroups = this.buildFiltersFromCriteria(criteria);

    const properties = [
      ...DEFAULT_PROPERTIES,
      ...(options.additionalProperties || []),
    ];

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
    const hash = crypto
      .createHash('md5')
      .update(criteriaStr)
      .digest('hex')
      .substring(0, 12);

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
