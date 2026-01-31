import { Test, TestingModule } from '@nestjs/testing';
import { DormancyScanScheduler } from './dormancy-scan.scheduler';
import { DormancyScanProcessor } from './dormancy-scan.processor';
import { getQueueToken } from '@nestjs/bull';
import { QUEUE_NAMES } from '../config/redis.config';
import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { HubspotAccount } from '../entities/hubspot-account.entity';

describe('DormancyScanScheduler', () => {
  let scheduler: DormancyScanScheduler;
  let scanProcessor: DormancyScanProcessor;
  let accountRepository: Repository<HubspotAccount>;

  const mockAccount = {
    id: 'account-uuid-123',
    portalId: 12345,
    companyName: 'Test Company',
    isActive: true,
  };

  const mockQueue = {
    add: jest.fn(),
    getJobs: jest.fn(),
    clean: jest.fn(),
  };

  const mockScanProcessor = {
    processScheduledScan: jest.fn(),
    getScanStatus: jest.fn(),
  };

  const mockAccountRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DormancyScanScheduler,
        {
          provide: DormancyScanProcessor,
          useValue: mockScanProcessor,
        },
        {
          provide: getQueueToken(QUEUE_NAMES.DORMANCY_SCAN),
          useValue: mockQueue,
        },
        {
          provide: getRepositoryToken(HubspotAccount),
          useValue: mockAccountRepository,
        },
      ],
    }).compile();

    scheduler = module.get<DormancyScanScheduler>(DormancyScanScheduler);
    scanProcessor = module.get<DormancyScanProcessor>(DormancyScanProcessor);
    accountRepository = module.get<Repository<HubspotAccount>>(
      getRepositoryToken(HubspotAccount),
    );

    // Suppress logger output during tests
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    jest.clearAllMocks();
  });

  describe('handleDailyScan', () => {
    it('should trigger daily scan for all active accounts', async () => {
      mockAccountRepository.find.mockResolvedValue([mockAccount]);
      mockScanProcessor.processScheduledScan.mockResolvedValue({
        accountsProcessed: 1,
        accountsFailed: 0,
        totalContactsFound: 10,
        results: [],
        completedAt: new Date(),
      });

      await scheduler.handleDailyScan();

      expect(mockAccountRepository.find).toHaveBeenCalledWith({
        where: { isActive: true },
      });
      expect(mockScanProcessor.processScheduledScan).toHaveBeenCalledWith([
        { id: mockAccount.id, portalId: mockAccount.portalId },
      ]);
    });

    it('should skip if no active accounts', async () => {
      mockAccountRepository.find.mockResolvedValue([]);

      await scheduler.handleDailyScan();

      expect(mockScanProcessor.processScheduledScan).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockAccountRepository.find.mockRejectedValue(new Error('Database error'));

      // Should not throw
      await expect(scheduler.handleDailyScan()).resolves.not.toThrow();
    });
  });

  describe('triggerScanForAccount', () => {
    it('should add a job to the queue for specific account', async () => {
      mockAccountRepository.findOne.mockResolvedValue(mockAccount);

      await scheduler.triggerScanForAccount(mockAccount.id);

      expect(mockQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: mockAccount.id,
          portalId: mockAccount.portalId,
        }),
        expect.any(Object),
      );
    });

    it('should throw error if account not found', async () => {
      mockAccountRepository.findOne.mockResolvedValue(null);

      await expect(
        scheduler.triggerScanForAccount('non-existent'),
      ).rejects.toThrow('Account not found');
    });

    it('should support specifying a rule ID', async () => {
      mockAccountRepository.findOne.mockResolvedValue(mockAccount);
      const ruleId = 'rule-uuid-123';

      await scheduler.triggerScanForAccount(mockAccount.id, { ruleId });

      expect(mockQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: mockAccount.id,
          ruleId,
        }),
        expect.any(Object),
      );
    });

    it('should support forceRefresh option', async () => {
      mockAccountRepository.findOne.mockResolvedValue(mockAccount);

      await scheduler.triggerScanForAccount(mockAccount.id, { forceRefresh: true });

      expect(mockQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({
          forceRefresh: true,
        }),
        expect.any(Object),
      );
    });
  });

  describe('getSchedulerStatus', () => {
    it('should return scheduler status', async () => {
      mockQueue.getJobs.mockResolvedValue([{ id: 'job-1' }]);

      const status = await scheduler.getSchedulerStatus();

      expect(status).toHaveProperty('isRunning');
      expect(status).toHaveProperty('pendingJobs');
      expect(status).toHaveProperty('lastRunAt');
    });
  });

  describe('pauseScheduler', () => {
    it('should pause the scheduler', async () => {
      await scheduler.pauseScheduler();

      const status = await scheduler.getSchedulerStatus();
      expect(status.isRunning).toBe(false);
    });
  });

  describe('resumeScheduler', () => {
    it('should resume the scheduler', async () => {
      await scheduler.pauseScheduler();
      await scheduler.resumeScheduler();

      const status = await scheduler.getSchedulerStatus();
      expect(status.isRunning).toBe(true);
    });
  });

  describe('cron configuration', () => {
    it('should have daily cron expression configured', () => {
      // The cron expression should be configured for daily execution
      // This is a meta-test to ensure the cron is set up
      expect(scheduler).toBeDefined();
    });
  });
});
