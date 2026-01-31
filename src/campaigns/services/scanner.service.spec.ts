import { Test, TestingModule } from '@nestjs/testing';
import { ScannerService, ScanResult } from './scanner.service';
import { QueryBuilderService } from './query-builder.service';
import { DormancyRulesService } from './dormancy-rules.service';
import { ContactsService } from '../../hubspot/services/contacts.service';
import { ActionType } from '../../entities/dormancy-rule.entity';
import { Logger } from '@nestjs/common';

describe('ScannerService', () => {
  let service: ScannerService;
  let queryBuilder: QueryBuilderService;
  let rulesService: DormancyRulesService;
  let contactsService: ContactsService;

  const mockAccountId = 'account-uuid-123';
  const mockPortalId = 12345;

  const mockRule = {
    id: 'rule-uuid-123',
    accountId: mockAccountId,
    name: 'Test Rule',
    isActive: true,
    criteria: {
      min_days_inactive: 30,
      no_email_opens_days: 14,
    },
    actionType: ActionType.EMAIL,
    actionConfig: { tone: 'professional' },
    createdAt: new Date(),
  };

  const mockContact = {
    id: 'contact-123',
    properties: {
      email: 'test@example.com',
      firstname: 'John',
      lastname: 'Doe',
      notes_last_contacted: '2024-12-01',
    },
    createdAt: '2024-01-01',
    updatedAt: '2024-12-01',
  };

  const mockQueryBuilder = {
    buildFiltersFromCriteria: jest.fn(),
    buildSearchRequest: jest.fn(),
    getCacheKey: jest.fn(),
  };

  const mockRulesService = {
    findActive: jest.fn(),
    findOne: jest.fn(),
  };

  const mockContactsService = {
    searchWithRequest: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScannerService,
        {
          provide: QueryBuilderService,
          useValue: mockQueryBuilder,
        },
        {
          provide: DormancyRulesService,
          useValue: mockRulesService,
        },
        {
          provide: ContactsService,
          useValue: mockContactsService,
        },
      ],
    }).compile();

    service = module.get<ScannerService>(ScannerService);
    queryBuilder = module.get<QueryBuilderService>(QueryBuilderService);
    rulesService = module.get<DormancyRulesService>(DormancyRulesService);
    contactsService = module.get<ContactsService>(ContactsService);

    // Suppress logger output during tests
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    jest.clearAllMocks();

    // Clear internal cache before each test
    service.clearAllCache();
  });

  describe('scanForRule', () => {
    it('should scan contacts matching a dormancy rule', async () => {
      mockRulesService.findOne.mockResolvedValue(mockRule);
      mockQueryBuilder.buildSearchRequest.mockReturnValue({
        filterGroups: [{ filters: [] }],
        properties: ['email'],
        limit: 100,
      });
      mockContactsService.searchWithRequest.mockResolvedValue({
        contacts: [mockContact],
        total: 1,
      });
      mockQueryBuilder.getCacheKey.mockReturnValue('cache-key');

      const result = await service.scanForRule(mockAccountId, mockPortalId, mockRule.id);

      expect(result.contacts).toHaveLength(1);
      expect(result.totalFound).toBe(1);
      expect(result.ruleId).toBe(mockRule.id);
    });

    it('should use cache when available (second call returns cached)', async () => {
      mockRulesService.findOne.mockResolvedValue(mockRule);
      mockQueryBuilder.buildSearchRequest.mockReturnValue({
        filterGroups: [{ filters: [] }],
        properties: ['email'],
        limit: 100,
      });
      mockContactsService.searchWithRequest.mockResolvedValue({
        contacts: [mockContact],
        total: 1,
      });
      mockQueryBuilder.getCacheKey.mockReturnValue('cache-key-2');

      // First call - should hit the API
      const result1 = await service.scanForRule(mockAccountId, mockPortalId, mockRule.id);

      // Second call - should use cache
      const result2 = await service.scanForRule(mockAccountId, mockPortalId, mockRule.id);

      // searchContacts should only be called once
      expect(mockContactsService.searchWithRequest).toHaveBeenCalledTimes(1);
      expect(result1.contacts).toEqual(result2.contacts);
    });

    it('should skip cache when forceRefresh is true', async () => {
      mockRulesService.findOne.mockResolvedValue(mockRule);
      mockQueryBuilder.buildSearchRequest.mockReturnValue({
        filterGroups: [{ filters: [] }],
        properties: ['email'],
        limit: 100,
      });
      mockContactsService.searchWithRequest.mockResolvedValue({
        contacts: [],
        total: 0,
      });
      mockQueryBuilder.getCacheKey.mockReturnValue('cache-key-3');

      // First call
      await service.scanForRule(mockAccountId, mockPortalId, mockRule.id);

      // Second call with forceRefresh
      await service.scanForRule(mockAccountId, mockPortalId, mockRule.id, { forceRefresh: true });

      // searchContacts should be called twice (cache bypassed)
      expect(mockContactsService.searchWithRequest).toHaveBeenCalledTimes(2);
    });

    it('should cache results after scan', async () => {
      mockRulesService.findOne.mockResolvedValue(mockRule);
      mockQueryBuilder.buildSearchRequest.mockReturnValue({
        filterGroups: [{ filters: [] }],
        properties: ['email'],
        limit: 100,
      });
      mockContactsService.searchWithRequest.mockResolvedValue({
        contacts: [mockContact],
        total: 1,
      });
      mockQueryBuilder.getCacheKey.mockReturnValue('cache-key-4');

      // First call
      await service.scanForRule(mockAccountId, mockPortalId, mockRule.id);

      // Second call should use cache (verify by checking searchContacts call count)
      await service.scanForRule(mockAccountId, mockPortalId, mockRule.id);

      expect(mockContactsService.searchWithRequest).toHaveBeenCalledTimes(1);
    });
  });

  describe('scanAllRules', () => {
    it('should scan all active rules for an account', async () => {
      mockRulesService.findActive.mockResolvedValue([mockRule]);
      mockRulesService.findOne.mockResolvedValue(mockRule);
      mockQueryBuilder.buildSearchRequest.mockReturnValue({
        filterGroups: [{ filters: [] }],
        properties: ['email'],
        limit: 100,
      });
      mockContactsService.searchWithRequest.mockResolvedValue({
        contacts: [mockContact],
        total: 1,
      });
      mockQueryBuilder.getCacheKey.mockReturnValue('cache-key-all-1');

      const results = await service.scanAllRules(mockAccountId, mockPortalId);

      expect(results).toHaveLength(1);
      expect(results[0].ruleId).toBe(mockRule.id);
    });

    it('should return empty array if no active rules', async () => {
      mockRulesService.findActive.mockResolvedValue([]);

      const results = await service.scanAllRules(mockAccountId, mockPortalId);

      expect(results).toHaveLength(0);
    });

    it('should continue scanning if one rule fails', async () => {
      const rule2 = { ...mockRule, id: 'rule-2' };
      mockRulesService.findActive.mockResolvedValue([mockRule, rule2]);
      mockRulesService.findOne
        .mockResolvedValueOnce(mockRule)
        .mockResolvedValueOnce(rule2);
      mockQueryBuilder.buildSearchRequest.mockReturnValue({
        filterGroups: [{ filters: [] }],
        properties: ['email'],
        limit: 100,
      });
      mockContactsService.searchWithRequest
        .mockRejectedValueOnce(new Error('API error'))
        .mockResolvedValueOnce({ contacts: [mockContact], total: 1 });
      mockQueryBuilder.getCacheKey
        .mockReturnValueOnce('cache-key-fail-1')
        .mockReturnValueOnce('cache-key-fail-2');

      const results = await service.scanAllRules(mockAccountId, mockPortalId);

      // Should have result for rule2 even though rule1 failed
      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('pagination', () => {
    it('should handle paginated results', async () => {
      mockRulesService.findOne.mockResolvedValue(mockRule);
      mockQueryBuilder.buildSearchRequest.mockReturnValue({
        filterGroups: [{ filters: [] }],
        properties: ['email'],
        limit: 100,
      });
      mockQueryBuilder.getCacheKey.mockReturnValue('cache-key-paginate');

      // First page
      mockContactsService.searchWithRequest.mockResolvedValueOnce({
        contacts: Array(100).fill(mockContact),
        total: 150,
      });

      const result = await service.scanForRule(mockAccountId, mockPortalId, mockRule.id, {
        limit: 100,
      });

      expect(result.contacts).toHaveLength(100);
    });
  });

  describe('clearCache', () => {
    it('should clear cache for a specific rule', async () => {
      mockRulesService.findOne.mockResolvedValue(mockRule);
      mockQueryBuilder.buildSearchRequest.mockReturnValue({
        filterGroups: [{ filters: [] }],
        properties: ['email'],
        limit: 100,
      });
      mockContactsService.searchWithRequest.mockResolvedValue({
        contacts: [mockContact],
        total: 1,
      });
      mockQueryBuilder.getCacheKey.mockReturnValue('cache-key-clear');

      // First call - populate cache
      await service.scanForRule(mockAccountId, mockPortalId, mockRule.id);

      // Clear cache
      await service.clearCache(mockAccountId, mockRule.id);

      // Second call - should hit API again (cache cleared)
      await service.scanForRule(mockAccountId, mockPortalId, mockRule.id);

      // searchContacts should be called twice (cache was cleared)
      expect(mockContactsService.searchWithRequest).toHaveBeenCalledTimes(2);
    });
  });

  describe('clearAllCache', () => {
    it('should clear all cached results', async () => {
      mockRulesService.findOne.mockResolvedValue(mockRule);
      mockQueryBuilder.buildSearchRequest.mockReturnValue({
        filterGroups: [{ filters: [] }],
        properties: ['email'],
        limit: 100,
      });
      mockContactsService.searchWithRequest.mockResolvedValue({
        contacts: [mockContact],
        total: 1,
      });
      mockQueryBuilder.getCacheKey.mockReturnValue('cache-key-clear-all');

      // First call - populate cache
      await service.scanForRule(mockAccountId, mockPortalId, mockRule.id);

      // Clear all cache
      service.clearAllCache();

      // Second call - should hit API again
      await service.scanForRule(mockAccountId, mockPortalId, mockRule.id);

      expect(mockContactsService.searchWithRequest).toHaveBeenCalledTimes(2);
    });
  });

  describe('error handling', () => {
    it('should throw error if rule not found', async () => {
      mockRulesService.findOne.mockResolvedValue(null);

      await expect(
        service.scanForRule(mockAccountId, mockPortalId, 'non-existent-rule'),
      ).rejects.toThrow('Rule not found');
    });

    it('should throw error if rule belongs to different account', async () => {
      // DormancyRulesService.findOne filters by accountId internally,
      // so it returns null when accountId doesn't match
      mockRulesService.findOne.mockResolvedValue(null);

      await expect(
        service.scanForRule(mockAccountId, mockPortalId, mockRule.id),
      ).rejects.toThrow('Rule not found');
    });
  });
});
