import { Test, TestingModule } from '@nestjs/testing';
import { QueryBuilderService, HubspotFilterGroup, HubspotFilter } from './query-builder.service';
import { DormancyCriteria } from '../../entities/dormancy-rule.entity';

describe('QueryBuilderService', () => {
  let service: QueryBuilderService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [QueryBuilderService],
    }).compile();

    service = module.get<QueryBuilderService>(QueryBuilderService);
  });

  describe('buildFiltersFromCriteria', () => {
    it('should build filter groups for min_days_inactive with NULL handling', () => {
      const criteria: DormancyCriteria = {
        min_days_inactive: 30,
      };

      const filterGroups = service.buildFiltersFromCriteria(criteria);

      // Should create 2 filter groups: one with LT, one with NOT_HAS_PROPERTY
      expect(filterGroups).toHaveLength(2);

      // First group: contacts with old dates
      expect(filterGroups[0].filters).toContainEqual(
        expect.objectContaining({
          propertyName: 'notes_last_contacted',
          operator: 'LT',
        }),
      );

      // Second group: contacts never contacted (NULL)
      expect(filterGroups[1].filters).toContainEqual(
        expect.objectContaining({
          propertyName: 'notes_last_contacted',
          operator: 'NOT_HAS_PROPERTY',
        }),
      );
    });

    it('should calculate correct date for days inactive', () => {
      const criteria: DormancyCriteria = {
        min_days_inactive: 30,
      };

      const filterGroups = service.buildFiltersFromCriteria(criteria);
      const dateFilter = filterGroups[0].filters.find(
        (f: HubspotFilter) => f.propertyName === 'notes_last_contacted' && f.operator === 'LT',
      );

      // Value should be a date string 30 days ago
      const expectedDate = new Date();
      expectedDate.setDate(expectedDate.getDate() - 30);
      const expectedDateStr = expectedDate.toISOString().split('T')[0];

      expect(dateFilter?.value).toBe(expectedDateStr);
    });

    it('should build filter groups for no_email_opens_days with NULL handling', () => {
      const criteria: DormancyCriteria = {
        no_email_opens_days: 14,
      };

      const filterGroups = service.buildFiltersFromCriteria(criteria);

      // Should have 2 groups for OR logic (LT or NOT_HAS_PROPERTY)
      expect(filterGroups).toHaveLength(2);
      expect(filterGroups[0].filters).toContainEqual(
        expect.objectContaining({
          propertyName: 'hs_email_last_open_date',
          operator: 'LT',
        }),
      );
    });

    it('should build filter groups for no_email_clicks_days with NULL handling', () => {
      const criteria: DormancyCriteria = {
        no_email_clicks_days: 21,
      };

      const filterGroups = service.buildFiltersFromCriteria(criteria);

      expect(filterGroups).toHaveLength(2);
      expect(filterGroups[0].filters).toContainEqual(
        expect.objectContaining({
          propertyName: 'hs_email_last_click_date',
          operator: 'LT',
        }),
      );
    });

    it('should build filter groups for no_website_visits_days with NULL handling', () => {
      const criteria: DormancyCriteria = {
        no_website_visits_days: 60,
      };

      const filterGroups = service.buildFiltersFromCriteria(criteria);

      expect(filterGroups).toHaveLength(2);
      expect(filterGroups[0].filters).toContainEqual(
        expect.objectContaining({
          propertyName: 'hs_analytics_last_visit_timestamp',
          operator: 'LT',
        }),
      );
    });

    it('should build filter for min_lead_score only (no NULL handling needed)', () => {
      const criteria: DormancyCriteria = {
        min_lead_score: 50,
      };

      const filterGroups = service.buildFiltersFromCriteria(criteria);

      // Lead score doesn't need NULL handling, single group
      expect(filterGroups).toHaveLength(1);
      expect(filterGroups[0].filters).toContainEqual(
        expect.objectContaining({
          propertyName: 'hubspotscore',
          operator: 'GTE',
          value: '50',
        }),
      );
    });

    it('should build filter for deal_stages', () => {
      const criteria: DormancyCriteria = {
        deal_stages: ['qualifiedtobuy', 'presentationscheduled'],
      };

      const filterGroups = service.buildFiltersFromCriteria(criteria);

      // Deal stages create OR filter groups (one per stage)
      expect(filterGroups.length).toBeGreaterThanOrEqual(1);
    });

    it('should combine date criteria with common filters', () => {
      const criteria: DormancyCriteria = {
        min_days_inactive: 30,
        no_email_opens_days: 14,
        min_lead_score: 50,
      };

      const filterGroups = service.buildFiltersFromCriteria(criteria);

      // Should have 2 groups (for primary date criterion NULL handling)
      // Each group should have: lead_score filter + secondary date filter + primary date filter
      expect(filterGroups).toHaveLength(2);

      // Both groups should have the lead score filter
      for (const group of filterGroups) {
        expect(group.filters).toContainEqual(
          expect.objectContaining({
            propertyName: 'hubspotscore',
            operator: 'GTE',
            value: '50',
          }),
        );
      }
    });

    it('should handle empty criteria', () => {
      const criteria: DormancyCriteria = {};

      const filterGroups = service.buildFiltersFromCriteria(criteria);

      expect(filterGroups).toHaveLength(0);
    });
  });

  describe('buildExclusionFilters', () => {
    it('should build exclusion filter for tags', () => {
      const criteria: DormancyCriteria = {
        min_days_inactive: 30,
        exclude_tags: ['vip', 'do-not-contact'],
      };

      const filters = service.buildFiltersFromCriteria(criteria);

      // Should have NOT_CONTAINS_TOKEN filters for each tag
      const tagFilters = filters[0].filters.filter(
        (f: HubspotFilter) => f.propertyName === 'hs_tag' || f.operator === 'NOT_CONTAINS_TOKEN',
      );
      expect(tagFilters.length).toBeGreaterThan(0);
    });
  });

  describe('buildSearchRequest', () => {
    it('should build complete search request', () => {
      const criteria: DormancyCriteria = {
        min_days_inactive: 30,
      };

      const request = service.buildSearchRequest(criteria);

      expect(request).toHaveProperty('filterGroups');
      expect(request).toHaveProperty('properties');
      expect(request).toHaveProperty('limit');
      expect(request.properties).toContain('email');
      expect(request.properties).toContain('firstname');
    });

    it('should include default properties', () => {
      const criteria: DormancyCriteria = {
        min_days_inactive: 30,
      };

      const request = service.buildSearchRequest(criteria);

      expect(request.properties).toContain('notes_last_contacted');
      expect(request.properties).toContain('hs_email_last_open_date');
      expect(request.properties).toContain('hs_lead_status');
      expect(request.properties).toContain('lifecyclestage');
    });

    it('should allow custom limit', () => {
      const criteria: DormancyCriteria = {
        min_days_inactive: 30,
      };

      const request = service.buildSearchRequest(criteria, { limit: 50 });

      expect(request.limit).toBe(50);
    });

    it('should support pagination with after cursor', () => {
      const criteria: DormancyCriteria = {
        min_days_inactive: 30,
      };

      const request = service.buildSearchRequest(criteria, { after: 'cursor123' });

      expect(request.after).toBe('cursor123');
    });
  });

  describe('date calculations', () => {
    it('should handle timezone correctly', () => {
      const criteria: DormancyCriteria = {
        min_days_inactive: 1,
      };

      const filterGroups = service.buildFiltersFromCriteria(criteria);
      // First group has the LT filter
      const dateFilter = filterGroups[0].filters.find(
        (f: HubspotFilter) => f.operator === 'LT',
      );

      // Should be a valid ISO date string (YYYY-MM-DD)
      expect(dateFilter?.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should handle large day values', () => {
      const criteria: DormancyCriteria = {
        min_days_inactive: 365,
      };

      const filterGroups = service.buildFiltersFromCriteria(criteria);
      const dateFilter = filterGroups[0].filters.find(
        (f: HubspotFilter) => f.operator === 'LT',
      );

      const expectedDate = new Date();
      expectedDate.setDate(expectedDate.getDate() - 365);
      const expectedDateStr = expectedDate.toISOString().split('T')[0];

      expect(dateFilter?.value).toBe(expectedDateStr);
    });
  });

  describe('getCacheKey', () => {
    it('should generate consistent cache key for same criteria', () => {
      const criteria: DormancyCriteria = {
        min_days_inactive: 30,
        no_email_opens_days: 14,
      };

      const key1 = service.getCacheKey('account-1', criteria);
      const key2 = service.getCacheKey('account-1', criteria);

      expect(key1).toBe(key2);
    });

    it('should generate different keys for different accounts', () => {
      const criteria: DormancyCriteria = {
        min_days_inactive: 30,
      };

      const key1 = service.getCacheKey('account-1', criteria);
      const key2 = service.getCacheKey('account-2', criteria);

      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different criteria', () => {
      const criteria1: DormancyCriteria = {
        min_days_inactive: 30,
      };
      const criteria2: DormancyCriteria = {
        min_days_inactive: 60,
      };

      const key1 = service.getCacheKey('account-1', criteria1);
      const key2 = service.getCacheKey('account-1', criteria2);

      expect(key1).not.toBe(key2);
    });
  });
});
