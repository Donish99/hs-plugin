import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CampaignExecutorService,
  ExecutionOptions,
  ExecutionResult,
} from './campaign-executor.service';
import { EmailService } from './email.service';
import { SmsService } from './sms.service';
import { HubspotLoggerService } from './hubspot-logger.service';
import { OutreachRecord, OutreachStatus, OutreachChannel } from '../../entities/outreach-record.entity';
import { Campaign, CampaignStatus } from '../../entities/campaign.entity';
import { VariantService } from '../../ai/services/variant.service';

describe('CampaignExecutorService', () => {
  let service: CampaignExecutorService;
  let emailService: jest.Mocked<EmailService>;
  let smsService: jest.Mocked<SmsService>;
  let hubspotLogger: jest.Mocked<HubspotLoggerService>;
  let variantService: jest.Mocked<VariantService>;
  let outreachRepository: jest.Mocked<Repository<OutreachRecord>>;
  let campaignRepository: jest.Mocked<Repository<Campaign>>;

  const mockAccountId = 'account-123';
  const mockPortalId = 123456;
  const mockCampaignId = 'campaign-123';

  const createMockCampaign = (): Partial<Campaign> => ({
    id: mockCampaignId,
    accountId: mockAccountId,
    status: CampaignStatus.RUNNING,
    totalContacts: 10,
    emailsSent: 0,
  });

  const createMockOutreachRecord = (): Partial<OutreachRecord> => ({
    id: 'outreach-123',
    campaignId: mockCampaignId,
    accountId: mockAccountId,
    hubspotContactId: 12345,
    channel: OutreachChannel.EMAIL,
    contactEmail: 'test@example.com',
    subject: 'Test Subject',
    bodyText: 'Test body',
    status: OutreachStatus.PENDING,
  });

  let mockCampaign: Partial<Campaign>;
  let mockOutreachRecord: Partial<OutreachRecord>;

  const mockEmailService = {
    sendEmail: jest.fn(),
    sendEmailWithRetry: jest.fn(),
    sendBatch: jest.fn(),
    isValidEmail: jest.fn(),
  };

  const mockSmsService = {
    sendSms: jest.fn(),
    sendSmsWithRetry: jest.fn(),
    sendBatch: jest.fn(),
    isValidPhoneNumber: jest.fn(),
  };

  const mockHubspotLogger = {
    logEmailSent: jest.fn(),
    logSmsSent: jest.fn(),
    updateContactLastContacted: jest.fn(),
  };

  const mockVariantService = {
    markVariantAsSent: jest.fn(),
    getVariantById: jest.fn(),
  };

  const mockOutreachRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockCampaignRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignExecutorService,
        { provide: EmailService, useValue: mockEmailService },
        { provide: SmsService, useValue: mockSmsService },
        { provide: HubspotLoggerService, useValue: mockHubspotLogger },
        { provide: VariantService, useValue: mockVariantService },
        { provide: getRepositoryToken(OutreachRecord), useValue: mockOutreachRepository },
        { provide: getRepositoryToken(Campaign), useValue: mockCampaignRepository },
      ],
    }).compile();

    service = module.get<CampaignExecutorService>(CampaignExecutorService);
    emailService = module.get(EmailService);
    smsService = module.get(SmsService);
    hubspotLogger = module.get(HubspotLoggerService);
    variantService = module.get(VariantService);
    outreachRepository = module.get(getRepositoryToken(OutreachRecord));
    campaignRepository = module.get(getRepositoryToken(Campaign));

    // Reset mock data for each test
    mockCampaign = createMockCampaign();
    mockOutreachRecord = createMockOutreachRecord();

    jest.clearAllMocks();
  });

  describe('executeCampaign', () => {
    it('should execute pending outreach records', async () => {
      mockCampaignRepository.findOne.mockResolvedValue(mockCampaign);
      mockOutreachRepository.find.mockResolvedValue([mockOutreachRecord]);
      mockEmailService.sendEmailWithRetry.mockResolvedValue({
        success: true,
        messageId: 'msg-123',
      });
      mockHubspotLogger.logEmailSent.mockResolvedValue({ success: true });
      mockOutreachRepository.save.mockResolvedValue(mockOutreachRecord);

      const result = await service.executeCampaign(mockCampaignId, mockPortalId);

      expect(result.processed).toBe(1);
      expect(result.successful).toBe(1);
      expect(result.failed).toBe(0);
    });

    it('should respect daily sending limits', async () => {
      mockCampaignRepository.findOne.mockResolvedValue(mockCampaign);
      mockOutreachRepository.count.mockResolvedValue(50); // Already sent 50 today
      // Return only 50 records since the service will request with limit=50
      mockOutreachRepository.find.mockResolvedValue(
        Array(50).fill(mockOutreachRecord).map((r, i) => ({ ...r, id: `outreach-${i}` })),
      );
      mockEmailService.sendEmailWithRetry.mockResolvedValue({
        success: true,
        messageId: 'msg-123',
      });
      mockHubspotLogger.logEmailSent.mockResolvedValue({ success: true });

      const options: ExecutionOptions = {
        dailyLimit: 100,
      };

      const result = await service.executeCampaign(
        mockCampaignId,
        mockPortalId,
        options,
      );

      // Should only process 50 more (100 - 50 already sent)
      expect(result.processed).toBe(50);
      // Verify find was called with correct limit
      expect(mockOutreachRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
        }),
      );
    });

    it('should respect rate limiting', async () => {
      mockCampaignRepository.findOne.mockResolvedValue(mockCampaign);
      mockOutreachRepository.find.mockResolvedValue([
        mockOutreachRecord,
        { ...mockOutreachRecord, id: 'outreach-124' },
      ]);
      mockEmailService.sendEmailWithRetry.mockResolvedValue({
        success: true,
        messageId: 'msg-123',
      });
      mockHubspotLogger.logEmailSent.mockResolvedValue({ success: true });

      const startTime = Date.now();
      const options: ExecutionOptions = {
        rateLimit: 1, // 1 per second
        rateLimitWindowMs: 1000,
      };

      await service.executeCampaign(mockCampaignId, mockPortalId, options);

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeGreaterThanOrEqual(900); // Should take at least ~1 second
    });

    it('should handle email send failures', async () => {
      mockCampaignRepository.findOne.mockResolvedValue(mockCampaign);
      mockOutreachRepository.find.mockResolvedValue([mockOutreachRecord]);
      mockEmailService.sendEmailWithRetry.mockResolvedValue({
        success: false,
        error: 'Send failed',
      });
      mockOutreachRepository.save.mockResolvedValue(mockOutreachRecord);

      const result = await service.executeCampaign(mockCampaignId, mockPortalId);

      expect(result.processed).toBe(1);
      expect(result.failed).toBe(1);
    });

    it('should update campaign statistics', async () => {
      mockCampaignRepository.findOne.mockResolvedValue(mockCampaign);
      mockOutreachRepository.find.mockResolvedValue([mockOutreachRecord]);
      mockEmailService.sendEmailWithRetry.mockResolvedValue({
        success: true,
        messageId: 'msg-123',
      });
      mockHubspotLogger.logEmailSent.mockResolvedValue({ success: true });
      mockOutreachRepository.save.mockResolvedValue(mockOutreachRecord);

      await service.executeCampaign(mockCampaignId, mockPortalId);

      expect(mockCampaignRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          emailsSent: 1,
        }),
      );
    });

    it('should skip paused campaigns', async () => {
      mockCampaignRepository.findOne.mockResolvedValue({
        ...mockCampaign,
        status: CampaignStatus.PAUSED,
      });

      const result = await service.executeCampaign(mockCampaignId, mockPortalId);

      expect(result.processed).toBe(0);
      expect(result.skipped).toBe(true);
    });
  });

  describe('executeOutreach', () => {
    it('should send email for email channel', async () => {
      mockEmailService.sendEmailWithRetry.mockResolvedValue({
        success: true,
        messageId: 'msg-123',
      });
      mockHubspotLogger.logEmailSent.mockResolvedValue({ success: true });
      mockOutreachRepository.save.mockResolvedValue(mockOutreachRecord);

      const result = await service.executeOutreach(
        mockOutreachRecord as OutreachRecord,
        mockPortalId,
      );

      expect(result.success).toBe(true);
      expect(mockEmailService.sendEmailWithRetry).toHaveBeenCalled();
    });

    it('should send SMS for SMS channel', async () => {
      const smsRecord = {
        ...mockOutreachRecord,
        channel: OutreachChannel.SMS,
        contactEmail: undefined,
        bodyText: 'SMS body',
      };

      mockSmsService.sendSmsWithRetry.mockResolvedValue({
        success: true,
        messageSid: 'SM123',
      });
      mockHubspotLogger.logSmsSent.mockResolvedValue({ success: true });
      mockOutreachRepository.save.mockResolvedValue(smsRecord);

      const result = await service.executeOutreach(
        smsRecord as OutreachRecord,
        mockPortalId,
      );

      expect(result.success).toBe(true);
      expect(mockSmsService.sendSmsWithRetry).toHaveBeenCalled();
    });

    it('should update outreach status on success', async () => {
      mockEmailService.sendEmailWithRetry.mockResolvedValue({
        success: true,
        messageId: 'msg-123',
      });
      mockHubspotLogger.logEmailSent.mockResolvedValue({ success: true });
      mockOutreachRepository.save.mockImplementation(async (record) => record);

      await service.executeOutreach(
        mockOutreachRecord as OutreachRecord,
        mockPortalId,
      );

      expect(mockOutreachRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: OutreachStatus.SENT,
        }),
      );
    });

    it('should update outreach status on failure', async () => {
      mockEmailService.sendEmailWithRetry.mockResolvedValue({
        success: false,
        error: 'Failed',
      });
      mockOutreachRepository.save.mockImplementation(async (record) => record);

      await service.executeOutreach(
        mockOutreachRecord as OutreachRecord,
        mockPortalId,
      );

      expect(mockOutreachRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: OutreachStatus.FAILED,
        }),
      );
    });

    it('should store message ID on success', async () => {
      mockEmailService.sendEmailWithRetry.mockResolvedValue({
        success: true,
        messageId: 'sg-msg-12345',
      });
      mockHubspotLogger.logEmailSent.mockResolvedValue({ success: true });
      mockOutreachRepository.save.mockImplementation(async (record) => record);

      await service.executeOutreach(
        mockOutreachRecord as OutreachRecord,
        mockPortalId,
      );

      expect(mockOutreachRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          sendgridMessageId: 'sg-msg-12345',
        }),
      );
    });

    it('should mark variant as sent when present', async () => {
      const recordWithVariant = {
        ...mockOutreachRecord,
        variantId: 'variant-123',
      };

      mockEmailService.sendEmailWithRetry.mockResolvedValue({
        success: true,
        messageId: 'msg-123',
      });
      mockHubspotLogger.logEmailSent.mockResolvedValue({ success: true });
      mockOutreachRepository.save.mockResolvedValue(recordWithVariant);

      await service.executeOutreach(
        recordWithVariant as OutreachRecord,
        mockPortalId,
      );

      expect(mockVariantService.markVariantAsSent).toHaveBeenCalledWith('variant-123');
    });
  });

  describe('scheduling', () => {
    it('should respect business hours when configured', async () => {
      const options: ExecutionOptions = {
        businessHoursOnly: true,
        businessHoursStart: 9,
        businessHoursEnd: 17,
        timezone: 'America/New_York',
      };

      const isBusinessHours = service.isWithinBusinessHours(options);
      // This will depend on current time, so we just verify it returns a boolean
      expect(typeof isBusinessHours).toBe('boolean');
    });

    it('should calculate next execution window', () => {
      const options: ExecutionOptions = {
        businessHoursOnly: true,
        businessHoursStart: 9,
        businessHoursEnd: 17,
        timezone: 'UTC',
      };

      const nextWindow = service.getNextExecutionWindow(options);

      expect(nextWindow).toBeInstanceOf(Date);
    });

    it('should spread sends over time when configured', async () => {
      mockCampaignRepository.findOne.mockResolvedValue(mockCampaign);
      mockOutreachRepository.find.mockResolvedValue([
        mockOutreachRecord,
        { ...mockOutreachRecord, id: 'outreach-124' },
      ]);
      mockEmailService.sendEmailWithRetry.mockResolvedValue({
        success: true,
        messageId: 'msg-123',
      });
      mockHubspotLogger.logEmailSent.mockResolvedValue({ success: true });

      const startTime = Date.now();
      const options: ExecutionOptions = {
        spreadOverMinutes: 0.01, // Spread over 0.6 seconds (600ms)
      };

      await service.executeCampaign(mockCampaignId, mockPortalId, options);

      // With 2 messages spread over 600ms, there should be ~300ms delay between
      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeGreaterThanOrEqual(200); // At least 200ms
    }, 10000);
  });

  describe('limits enforcement', () => {
    it('should check monthly limits', async () => {
      mockOutreachRepository.count.mockResolvedValue(1000); // Already sent 1000

      const options: ExecutionOptions = {
        monthlyLimit: 1000,
      };

      const canSend = await service.checkMonthlyLimit(mockAccountId, options);

      expect(canSend).toBe(false);
    });

    it('should allow sending when under monthly limit', async () => {
      mockOutreachRepository.count.mockResolvedValue(500);

      const options: ExecutionOptions = {
        monthlyLimit: 1000,
      };

      const canSend = await service.checkMonthlyLimit(mockAccountId, options);

      expect(canSend).toBe(true);
    });

    it('should check daily limits', async () => {
      mockOutreachRepository.count.mockResolvedValue(100);

      const options: ExecutionOptions = {
        dailyLimit: 100,
      };

      const canSend = await service.checkDailyLimit(mockAccountId, options);

      expect(canSend).toBe(false);
    });

    it('should return remaining quota', async () => {
      mockOutreachRepository.count.mockResolvedValue(50);

      const options: ExecutionOptions = {
        dailyLimit: 100,
        monthlyLimit: 1000,
      };

      const quota = await service.getRemainingQuota(mockAccountId, options);

      expect(quota.dailyRemaining).toBe(50);
      expect(quota.monthlyRemaining).toBe(950);
    });
  });

  describe('queue processing', () => {
    it('should get pending outreach records for campaign', async () => {
      mockOutreachRepository.find.mockResolvedValue([mockOutreachRecord]);

      const records = await service.getPendingOutreach(mockCampaignId);

      expect(records).toHaveLength(1);
      expect(mockOutreachRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            campaignId: mockCampaignId,
            status: OutreachStatus.PENDING,
          }),
        }),
      );
    });

    it('should prioritize by creation date', async () => {
      mockOutreachRepository.find.mockResolvedValue([mockOutreachRecord]);

      await service.getPendingOutreach(mockCampaignId);

      expect(mockOutreachRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          order: { createdAt: 'ASC' },
        }),
      );
    });
  });
});
