import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ScanController } from './scan.controller';
import { DormancyScanScheduler, TriggerScanOptions, SchedulerStatus } from './dormancy-scan.scheduler';

describe('ScanController', () => {
  let controller: ScanController;
  let scheduler: jest.Mocked<DormancyScanScheduler>;

  const mockAccountId = 'acc-123';

  beforeEach(async () => {
    const mockScheduler = {
      triggerScanForAccount: jest.fn(),
      getSchedulerStatus: jest.fn(),
      pauseScheduler: jest.fn(),
      resumeScheduler: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ScanController],
      providers: [
        {
          provide: DormancyScanScheduler,
          useValue: mockScheduler,
        },
      ],
    }).compile();

    controller = module.get<ScanController>(ScanController);
    scheduler = module.get(DormancyScanScheduler);
  });

  describe('triggerScan', () => {
    it('should trigger a scan for the account', async () => {
      scheduler.triggerScanForAccount.mockResolvedValue(undefined);

      const result = await controller.triggerScan(mockAccountId, {});

      expect(scheduler.triggerScanForAccount).toHaveBeenCalledWith(mockAccountId, {});
      expect(result).toEqual({
        success: true,
        message: 'Scan triggered successfully',
        accountId: mockAccountId,
      });
    });

    it('should pass options to the scheduler', async () => {
      const options: TriggerScanOptions = {
        ruleId: 'rule-123',
        forceRefresh: true,
      };
      scheduler.triggerScanForAccount.mockResolvedValue(undefined);

      await controller.triggerScan(mockAccountId, options);

      expect(scheduler.triggerScanForAccount).toHaveBeenCalledWith(mockAccountId, options);
    });

    it('should propagate NotFoundException from scheduler', async () => {
      scheduler.triggerScanForAccount.mockRejectedValue(new NotFoundException('Account not found'));

      await expect(controller.triggerScan(mockAccountId, {})).rejects.toThrow(NotFoundException);
    });

    it('should include ruleId in response when provided', async () => {
      const options: TriggerScanOptions = { ruleId: 'rule-456' };
      scheduler.triggerScanForAccount.mockResolvedValue(undefined);

      const result = await controller.triggerScan(mockAccountId, options);

      expect(result).toEqual({
        success: true,
        message: 'Scan triggered successfully',
        accountId: mockAccountId,
        ruleId: 'rule-456',
      });
    });
  });

  describe('getStatus', () => {
    it('should return scheduler status', async () => {
      const mockStatus: SchedulerStatus = {
        isRunning: true,
        pendingJobs: 5,
        lastRunAt: new Date('2024-01-15T02:00:00Z'),
        nextRunAt: new Date('2024-01-16T02:00:00Z'),
      };
      scheduler.getSchedulerStatus.mockResolvedValue(mockStatus);

      const result = await controller.getStatus();

      expect(scheduler.getSchedulerStatus).toHaveBeenCalled();
      expect(result).toEqual(mockStatus);
    });

    it('should handle null dates in status', async () => {
      const mockStatus: SchedulerStatus = {
        isRunning: false,
        pendingJobs: 0,
        lastRunAt: null,
        nextRunAt: null,
      };
      scheduler.getSchedulerStatus.mockResolvedValue(mockStatus);

      const result = await controller.getStatus();

      expect(result.lastRunAt).toBeNull();
      expect(result.nextRunAt).toBeNull();
    });
  });

  describe('pauseScheduler', () => {
    it('should pause the scheduler', async () => {
      scheduler.pauseScheduler.mockResolvedValue(undefined);

      const result = await controller.pauseScheduler();

      expect(scheduler.pauseScheduler).toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        message: 'Scheduler paused',
      });
    });
  });

  describe('resumeScheduler', () => {
    it('should resume the scheduler', async () => {
      scheduler.resumeScheduler.mockResolvedValue(undefined);

      const result = await controller.resumeScheduler();

      expect(scheduler.resumeScheduler).toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        message: 'Scheduler resumed',
      });
    });
  });
});
