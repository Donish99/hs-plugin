import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bull';
import { getQueueToken } from '@nestjs/bull';
import { ContactSyncProcessor, ContactSyncJobData } from './contact-sync.processor';
import { ContactsService } from '../hubspot/services/contacts.service';
import { QUEUE_NAMES } from '../config/redis.config';
import { JobStatus } from './base.processor';
import { Logger } from '@nestjs/common';

describe('ContactSyncProcessor', () => {
  let processor: ContactSyncProcessor;
  let contactsService: ContactsService;

  const mockContactsService = {
    getContacts: jest.fn(),
  };

  const mockQueue = {
    add: jest.fn(),
  };

  const createMockJob = (data: ContactSyncJobData): Partial<Job<ContactSyncJobData>> => ({
    id: 'test-job-id',
    data,
    progress: jest.fn().mockResolvedValue(undefined),
    log: jest.fn().mockResolvedValue(undefined),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactSyncProcessor,
        {
          provide: ContactsService,
          useValue: mockContactsService,
        },
        {
          provide: getQueueToken(QUEUE_NAMES.CONTACT_SYNC),
          useValue: mockQueue,
        },
      ],
    }).compile();

    processor = module.get<ContactSyncProcessor>(ContactSyncProcessor);
    contactsService = module.get<ContactsService>(ContactsService);

    // Suppress logger output during tests
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    jest.clearAllMocks();
  });

  describe('processJob', () => {
    it('should sync contacts for given portal ID', async () => {
      const jobData: ContactSyncJobData = {
        portalId: 12345,
        fullSync: true,
      };
      const job = createMockJob(jobData);

      mockContactsService.getContacts.mockResolvedValue([
        { id: '1', properties: { email: 'test1@example.com' } },
        { id: '2', properties: { email: 'test2@example.com' } },
      ]);

      const result = await processor.processJob(job as Job<ContactSyncJobData>);

      expect(mockContactsService.getContacts).toHaveBeenCalledWith(
        12345,
        expect.objectContaining({ fetchAll: true }),
      );
      expect(result.status).toBe(JobStatus.COMPLETED);
      expect(result.data?.contactsSynced).toBe(2);
    });

    it('should update job progress during sync', async () => {
      const jobData: ContactSyncJobData = {
        portalId: 12345,
        fullSync: true,
      };
      const job = createMockJob(jobData);

      mockContactsService.getContacts.mockResolvedValue([]);

      await processor.processJob(job as Job<ContactSyncJobData>);

      expect(job.progress).toHaveBeenCalled();
    });

    it('should handle sync failure gracefully', async () => {
      const jobData: ContactSyncJobData = {
        portalId: 12345,
        fullSync: true,
      };
      const job = createMockJob(jobData);

      mockContactsService.getContacts.mockRejectedValue(new Error('API error'));

      const result = await processor.processJob(job as Job<ContactSyncJobData>);

      expect(result.status).toBe(JobStatus.FAILED);
      expect(result.error).toContain('API error');
    });

    it('should support incremental sync', async () => {
      const lastSyncDate = new Date('2025-01-01');
      const jobData: ContactSyncJobData = {
        portalId: 12345,
        fullSync: false,
        lastSyncAt: lastSyncDate.toISOString(),
      };
      const job = createMockJob(jobData);

      mockContactsService.getContacts.mockResolvedValue([]);

      const result = await processor.processJob(job as Job<ContactSyncJobData>);

      expect(mockContactsService.getContacts).toHaveBeenCalled();
      expect(result.status).toBe(JobStatus.COMPLETED);
    });

    it('should record sync timestamp on completion', async () => {
      const jobData: ContactSyncJobData = {
        portalId: 12345,
        fullSync: true,
      };
      const job = createMockJob(jobData);

      mockContactsService.getContacts.mockResolvedValue([]);

      const result = await processor.processJob(job as Job<ContactSyncJobData>);

      expect(result.data?.syncCompletedAt).toBeDefined();
    });
  });

  describe('scheduleInitialSync', () => {
    it('should add sync job to queue', async () => {
      const portalId = 12345;

      await processor.scheduleInitialSync(portalId);

      expect(mockQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({
          portalId,
          fullSync: true,
        }),
        expect.any(Object),
      );
    });

    it('should set appropriate job options', async () => {
      const portalId = 12345;

      await processor.scheduleInitialSync(portalId);

      expect(mockQueue.add).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          attempts: expect.any(Number),
          backoff: expect.any(Object),
        }),
      );
    });
  });

  describe('error handling', () => {
    it('should not throw on unknown errors', async () => {
      const jobData: ContactSyncJobData = {
        portalId: 12345,
        fullSync: true,
      };
      const job = createMockJob(jobData);

      mockContactsService.getContacts.mockRejectedValue('Unknown error');

      const result = await processor.processJob(job as Job<ContactSyncJobData>);

      expect(result.status).toBe(JobStatus.FAILED);
    });
  });
});
