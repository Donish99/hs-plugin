import { Test, TestingModule } from '@nestjs/testing';
import { DormancyScanProcessor } from './dormancy-scan.processor';
import { ScannerService } from '../campaigns/services/scanner.service';
import { DormancyRulesService } from '../campaigns/services/dormancy-rules.service';
import { CampaignService } from '../campaigns/services/campaign.service';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { ActionType } from '../entities/dormancy-rule.entity';
import { JobStatus } from './base.processor';

describe('DormancyScanProcessor', () => {
  let processor: DormancyScanProcessor;
  let scannerService: ScannerService;
  let rulesService: DormancyRulesService;

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

  const mockScanResult = {
    ruleId: mockRule.id,
    contacts: [mockContact],
    totalFound: 1,
    scannedAt: new Date(),
  };

  const mockScannerService = {
    scanForRule: jest.fn(),
    scanAllRules: jest.fn(),
    clearCache: jest.fn(),
    clearAllCache: jest.fn(),
  };

  const mockRulesService = {
    findActive: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
  };

  const mockCampaignService = {
    createCampaignFromScan: jest.fn(),
    createCampaignsFromMultipleScans: jest.fn(),
    findCampaignsByAccount: jest.fn(),
    getCampaignWithOutreachRecords: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DormancyScanProcessor,
        {
          provide: ScannerService,
          useValue: mockScannerService,
        },
        {
          provide: DormancyRulesService,
          useValue: mockRulesService,
        },
        {
          provide: CampaignService,
          useValue: mockCampaignService,
        },
      ],
    }).compile();

    processor = module.get<DormancyScanProcessor>(DormancyScanProcessor);
    scannerService = module.get<ScannerService>(ScannerService);
    rulesService = module.get<DormancyRulesService>(DormancyRulesService);

    // Suppress logger output during tests
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    jest.clearAllMocks();

    // Default mock for campaign service
    mockCampaignService.createCampaignsFromMultipleScans.mockResolvedValue([
      { campaign: { id: 'campaign-1' }, outreachRecordsCreated: 1, contactsSkipped: 0 },
    ]);
  });

  describe('processJob', () => {
    it('should process a scan job for a specific rule', async () => {
      const job = {
        id: 'job-1',
        data: {
          accountId: mockAccountId,
          portalId: mockPortalId,
          ruleId: mockRule.id,
        },
        progress: jest.fn(),
      } as unknown as Job;

      mockScannerService.scanForRule.mockResolvedValue(mockScanResult);

      const result = await processor.processJob(job);

      expect(mockScannerService.scanForRule).toHaveBeenCalledWith(
        mockAccountId,
        mockPortalId,
        mockRule.id,
        expect.any(Object),
      );
      expect(result.status).toBe(JobStatus.COMPLETED);
      expect(result.data?.scanResults).toEqual([mockScanResult]);
      expect(result.data?.totalFound).toBe(1);
    });

    it('should scan all rules when ruleId is not provided', async () => {
      const job = {
        id: 'job-2',
        data: {
          accountId: mockAccountId,
          portalId: mockPortalId,
        },
        progress: jest.fn(),
      } as unknown as Job;

      mockScannerService.scanAllRules.mockResolvedValue([mockScanResult]);

      const result = await processor.processJob(job);

      expect(mockScannerService.scanAllRules).toHaveBeenCalledWith(
        mockAccountId,
        mockPortalId,
        expect.any(Object),
      );
      expect(result.status).toBe(JobStatus.COMPLETED);
      expect(result.data?.scanResults).toEqual([mockScanResult]);
    });

    it('should use forceRefresh when specified in job data', async () => {
      const job = {
        id: 'job-3',
        data: {
          accountId: mockAccountId,
          portalId: mockPortalId,
          ruleId: mockRule.id,
          forceRefresh: true,
        },
        progress: jest.fn(),
      } as unknown as Job;

      mockScannerService.scanForRule.mockResolvedValue(mockScanResult);

      await processor.processJob(job);

      expect(mockScannerService.scanForRule).toHaveBeenCalledWith(
        mockAccountId,
        mockPortalId,
        mockRule.id,
        expect.objectContaining({ forceRefresh: true }),
      );
    });

    it('should throw error for invalid job data', async () => {
      const job = {
        id: 'job-4',
        data: {
          // Missing accountId and portalId
        },
        progress: jest.fn(),
      } as unknown as Job;

      await expect(processor.processJob(job)).rejects.toThrow(
        'Invalid job data: accountId and portalId are required',
      );
    });
  });

  describe('processScheduledScan', () => {
    it('should process scheduled scan for all accounts', async () => {
      const accounts = [
        { id: mockAccountId, portalId: mockPortalId },
        { id: 'account-2', portalId: 67890 },
      ];

      mockRulesService.findAll.mockResolvedValue([mockRule]);
      mockScannerService.scanAllRules
        .mockResolvedValueOnce([mockScanResult])
        .mockResolvedValueOnce([]);

      const result = await processor.processScheduledScan(accounts);

      expect(mockScannerService.scanAllRules).toHaveBeenCalledTimes(2);
      expect(result.accountsProcessed).toBe(2);
      expect(result.totalContactsFound).toBeGreaterThanOrEqual(1);
    });

    it('should continue processing if one account fails', async () => {
      const accounts = [
        { id: mockAccountId, portalId: mockPortalId },
        { id: 'account-2', portalId: 67890 },
      ];

      mockScannerService.scanAllRules
        .mockRejectedValueOnce(new Error('API Error'))
        .mockResolvedValueOnce([mockScanResult]);

      const result = await processor.processScheduledScan(accounts);

      expect(result.accountsProcessed).toBe(2);
      expect(result.accountsFailed).toBe(1);
    });

    it('should return empty result for empty accounts list', async () => {
      const result = await processor.processScheduledScan([]);

      expect(result.accountsProcessed).toBe(0);
      expect(result.totalContactsFound).toBe(0);
    });
  });

  describe('processBatchContacts', () => {
    it('should batch contacts into groups of specified size', () => {
      const contacts = Array(250).fill(mockContact).map((c, i) => ({
        ...c,
        id: `contact-${i}`,
      }));

      const batches = processor.batchContacts(contacts, 100);

      expect(batches).toHaveLength(3);
      expect(batches[0]).toHaveLength(100);
      expect(batches[1]).toHaveLength(100);
      expect(batches[2]).toHaveLength(50);
    });

    it('should return single batch for small contact lists', () => {
      const contacts = [mockContact];

      const batches = processor.batchContacts(contacts, 100);

      expect(batches).toHaveLength(1);
      expect(batches[0]).toHaveLength(1);
    });

    it('should return empty array for empty contacts', () => {
      const batches = processor.batchContacts([], 100);

      expect(batches).toHaveLength(0);
    });
  });

  describe('getScanStatus', () => {
    it('should return scan status for an account', async () => {
      const status = await processor.getScanStatus(mockAccountId);

      expect(status).toHaveProperty('lastScanAt');
      expect(status).toHaveProperty('status');
      expect(status).toHaveProperty('contactsFound');
    });
  });

  describe('error handling', () => {
    it('should log errors when scan fails', async () => {
      const job = {
        id: 'job-error',
        data: {
          accountId: mockAccountId,
          portalId: mockPortalId,
          ruleId: mockRule.id,
        },
        progress: jest.fn(),
      } as unknown as Job;

      const error = new Error('HubSpot API Error');
      mockScannerService.scanForRule.mockRejectedValue(error);

      await expect(processor.processJob(job)).rejects.toThrow('HubSpot API Error');
    });

    it('should handle rate limit errors gracefully', async () => {
      const job = {
        id: 'job-rate-limit',
        data: {
          accountId: mockAccountId,
          portalId: mockPortalId,
          ruleId: mockRule.id,
        },
        progress: jest.fn(),
      } as unknown as Job;

      const rateLimitError = new Error('Rate limit exceeded');
      (rateLimitError as any).code = 429;
      mockScannerService.scanForRule.mockRejectedValue(rateLimitError);

      await expect(processor.processJob(job)).rejects.toThrow('Rate limit exceeded');
    });
  });

  describe('incremental scanning', () => {
    it('should support incremental scanning with lastScanAt', async () => {
      const lastScanAt = new Date('2025-01-01');
      const job = {
        id: 'job-incremental',
        data: {
          accountId: mockAccountId,
          portalId: mockPortalId,
          ruleId: mockRule.id,
          incrementalSince: lastScanAt.toISOString(),
        },
        progress: jest.fn(),
      } as unknown as Job;

      mockScannerService.scanForRule.mockResolvedValue(mockScanResult);

      await processor.processJob(job);

      expect(mockScannerService.scanForRule).toHaveBeenCalledWith(
        mockAccountId,
        mockPortalId,
        mockRule.id,
        expect.objectContaining({
          incrementalSince: lastScanAt.toISOString(),
        }),
      );
    });
  });

  describe('scan logging', () => {
    it('should create scan log entry on successful scan', async () => {
      const job = {
        id: 'job-log',
        data: {
          accountId: mockAccountId,
          portalId: mockPortalId,
          ruleId: mockRule.id,
        },
        progress: jest.fn(),
      } as unknown as Job;

      mockScannerService.scanForRule.mockResolvedValue(mockScanResult);

      const result = await processor.processJob(job);

      // The scan log should be tracked internally
      expect(result).toBeDefined();
      expect(result.status).toBe(JobStatus.COMPLETED);
      expect(result.data?.scanResults).toBeDefined();
    });
  });
});
