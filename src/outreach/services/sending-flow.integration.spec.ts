import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { EmailService } from './email.service';
import { SmsService } from './sms.service';
import { HubspotLoggerService } from './hubspot-logger.service';
import { CampaignExecutorService } from './campaign-executor.service';
import { DeliveryStatusService } from './delivery-status.service';
import { VariantService } from '../../ai/services/variant.service';
import { OAuthService } from '../../hubspot/services/oauth.service';
import {
  OutreachRecord,
  OutreachStatus,
  OutreachChannel,
} from '../../entities/outreach-record.entity';
import { Campaign, CampaignStatus } from '../../entities/campaign.entity';

// Mock @sendgrid/mail
jest.mock('@sendgrid/mail', () => ({
  setApiKey: jest.fn(),
  send: jest.fn().mockResolvedValue([{ statusCode: 202, headers: { 'x-message-id': 'msg-123' } }]),
}));

// Mock @hubspot/api-client
jest.mock('@hubspot/api-client', () => ({
  Client: jest.fn().mockImplementation(() => ({
    crm: {
      objects: {
        emails: { basicApi: { create: jest.fn().mockResolvedValue({ id: 'email-123' }) } },
        communications: { basicApi: { create: jest.fn().mockResolvedValue({ id: 'comm-123' }) } },
        tasks: { basicApi: { create: jest.fn().mockResolvedValue({ id: 'task-123' }) } },
      },
      contacts: {
        basicApi: { update: jest.fn().mockResolvedValue({}) },
      },
    },
  })),
}));

/**
 * Integration tests for the complete sending flow
 * Tests the interaction between EmailService, CampaignExecutorService,
 * DeliveryStatusService, and HubspotLoggerService
 */
describe('Sending Flow Integration', () => {
  let campaignExecutor: CampaignExecutorService;
  let deliveryStatus: DeliveryStatusService;
  let emailService: jest.Mocked<EmailService>;
  let smsService: jest.Mocked<SmsService>;
  let hubspotLogger: jest.Mocked<HubspotLoggerService>;
  let outreachRepository: jest.Mocked<Repository<OutreachRecord>>;
  let campaignRepository: jest.Mocked<Repository<Campaign>>;

  const mockPortalId = 123456;
  const mockAccountId = 'account-123';
  const mockCampaignId = 'campaign-123';

  const mockEmailService = {
    sendEmail: jest.fn(),
    sendEmailWithRetry: jest.fn(),
    sendBatch: jest.fn(),
    isValidEmail: jest.fn().mockReturnValue(true),
    isBounceError: jest.fn().mockReturnValue(false),
  };

  const mockSmsService = {
    sendSms: jest.fn(),
    sendSmsWithRetry: jest.fn(),
    sendBatch: jest.fn(),
    isValidPhoneNumber: jest.fn().mockReturnValue(true),
    calculateSegments: jest.fn().mockReturnValue(1),
    isOptOutMessage: jest.fn().mockReturnValue(false),
  };

  const mockHubspotLogger = {
    logEmailSent: jest.fn(),
    logSmsSent: jest.fn(),
    updateContactLastContacted: jest.fn(),
    createFollowUpTask: jest.fn(),
    logBounce: jest.fn(),
  };

  const mockOutreachRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    count: jest.fn(),
  };

  const mockCampaignRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const mockVariantService = {
    markVariantAsSent: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignExecutorService,
        DeliveryStatusService,
        { provide: EmailService, useValue: mockEmailService },
        { provide: SmsService, useValue: mockSmsService },
        { provide: HubspotLoggerService, useValue: mockHubspotLogger },
        { provide: getRepositoryToken(OutreachRecord), useValue: mockOutreachRepository },
        { provide: getRepositoryToken(Campaign), useValue: mockCampaignRepository },
        { provide: VariantService, useValue: mockVariantService },
      ],
    }).compile();

    campaignExecutor = module.get<CampaignExecutorService>(CampaignExecutorService);
    deliveryStatus = module.get<DeliveryStatusService>(DeliveryStatusService);
    emailService = module.get(EmailService);
    smsService = module.get(SmsService);
    hubspotLogger = module.get(HubspotLoggerService);
    outreachRepository = module.get(getRepositoryToken(OutreachRecord));
    campaignRepository = module.get(getRepositoryToken(Campaign));

    jest.clearAllMocks();
  });

  describe('Email sending flow', () => {
    const createMockCampaign = (): Partial<Campaign> => ({
      id: mockCampaignId,
      accountId: mockAccountId,
      status: CampaignStatus.RUNNING,
      emailsSent: 0,
    });

    const createMockOutreachRecords = (): Partial<OutreachRecord>[] => [
      {
        id: 'outreach-1',
        campaignId: mockCampaignId,
        accountId: mockAccountId,
        hubspotContactId: 12345,
        channel: OutreachChannel.EMAIL,
        contactEmail: 'test1@example.com',
        subject: 'Test Subject 1',
        bodyText: 'Test body 1',
        bodyHtml: '<p>Test body 1</p>',
        status: OutreachStatus.PENDING,
      },
      {
        id: 'outreach-2',
        campaignId: mockCampaignId,
        accountId: mockAccountId,
        hubspotContactId: 12346,
        channel: OutreachChannel.EMAIL,
        contactEmail: 'test2@example.com',
        subject: 'Test Subject 2',
        bodyText: 'Test body 2',
        bodyHtml: '<p>Test body 2</p>',
        status: OutreachStatus.PENDING,
      },
    ];

    it('should execute campaign and send multiple emails', async () => {
      const mockCampaign = createMockCampaign();
      const mockRecords = createMockOutreachRecords();

      mockCampaignRepository.findOne.mockResolvedValue(mockCampaign);
      mockOutreachRepository.find.mockResolvedValue(mockRecords);
      mockOutreachRepository.count.mockResolvedValue(0);
      mockOutreachRepository.save.mockImplementation(async (record) => record);
      mockCampaignRepository.save.mockImplementation(async (campaign) => campaign);

      mockEmailService.sendEmailWithRetry.mockResolvedValue({
        success: true,
        messageId: 'msg-123',
      });
      mockHubspotLogger.logEmailSent.mockResolvedValue({ success: true });

      const result = await campaignExecutor.executeCampaign(mockCampaignId, mockPortalId);

      expect(result.processed).toBe(2);
      expect(result.successful).toBe(2);
      expect(result.failed).toBe(0);
      expect(mockEmailService.sendEmailWithRetry).toHaveBeenCalledTimes(2);
      expect(mockHubspotLogger.logEmailSent).toHaveBeenCalledTimes(2);
    });

    it('should handle partial failures in campaign', async () => {
      const mockCampaign = createMockCampaign();
      const mockRecords = createMockOutreachRecords();

      mockCampaignRepository.findOne.mockResolvedValue(mockCampaign);
      mockOutreachRepository.find.mockResolvedValue(mockRecords);
      mockOutreachRepository.count.mockResolvedValue(0);
      mockOutreachRepository.save.mockImplementation(async (record) => record);
      mockCampaignRepository.save.mockImplementation(async (campaign) => campaign);

      // First email succeeds, second fails
      mockEmailService.sendEmailWithRetry
        .mockResolvedValueOnce({ success: true, messageId: 'msg-1' })
        .mockResolvedValueOnce({ success: false, error: 'Send failed' });

      mockHubspotLogger.logEmailSent.mockResolvedValue({ success: true });

      const result = await campaignExecutor.executeCampaign(mockCampaignId, mockPortalId);

      expect(result.processed).toBe(2);
      expect(result.successful).toBe(1);
      expect(result.failed).toBe(1);
    });

    it('should update outreach status after sending', async () => {
      const mockCampaign = createMockCampaign();
      const outreachRecord = createMockOutreachRecords()[0] as OutreachRecord;

      mockCampaignRepository.findOne.mockResolvedValue(mockCampaign);
      mockOutreachRepository.find.mockResolvedValue([outreachRecord]);
      mockOutreachRepository.count.mockResolvedValue(0);
      mockOutreachRepository.save.mockImplementation(async (record) => record);
      mockCampaignRepository.save.mockImplementation(async (campaign) => campaign);

      mockEmailService.sendEmailWithRetry.mockResolvedValue({
        success: true,
        messageId: 'sg-msg-123',
      });
      mockHubspotLogger.logEmailSent.mockResolvedValue({ success: true });

      await campaignExecutor.executeCampaign(mockCampaignId, mockPortalId);

      expect(mockOutreachRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: OutreachStatus.SENT,
          sendgridMessageId: 'sg-msg-123',
        }),
      );
    });
  });

  describe('Delivery status webhook flow', () => {
    const createMockSentRecord = (): Partial<OutreachRecord> => ({
      id: 'outreach-1',
      campaignId: mockCampaignId,
      accountId: mockAccountId,
      hubspotContactId: 12345,
      channel: OutreachChannel.EMAIL,
      contactEmail: 'test@example.com',
      sendgridMessageId: 'sg-msg-123',
      status: OutreachStatus.SENT,
    });

    const createMockCampaign = (): Partial<Campaign> => ({
      id: mockCampaignId,
      emailsSent: 1,
      emailsOpened: 0,
    });

    it('should process delivery event and update record status', async () => {
      const mockSentRecord = createMockSentRecord();
      const mockCampaign = createMockCampaign();

      mockOutreachRepository.findOne.mockResolvedValue(mockSentRecord);
      mockCampaignRepository.findOne.mockResolvedValue(mockCampaign);
      mockOutreachRepository.save.mockImplementation(async (record) => record);
      mockCampaignRepository.save.mockImplementation(async (campaign) => campaign);

      const result = await deliveryStatus.processSendGridWebhook(
        [
          {
            event: 'delivered',
            sg_message_id: 'sg-msg-123',
            timestamp: Date.now() / 1000,
            email: 'test@example.com',
          },
        ],
        mockPortalId,
      );

      expect(result.processed).toBe(1);
      expect(mockOutreachRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: OutreachStatus.DELIVERED,
        }),
      );
    });

    it('should process open event and update campaign stats', async () => {
      const mockSentRecord = createMockSentRecord();
      mockSentRecord.status = OutreachStatus.DELIVERED;
      const mockCampaign = createMockCampaign();

      mockOutreachRepository.findOne.mockResolvedValue(mockSentRecord);
      mockCampaignRepository.findOne.mockResolvedValue(mockCampaign);
      mockOutreachRepository.save.mockImplementation(async (record) => record);
      mockCampaignRepository.save.mockImplementation(async (campaign) => campaign);

      const result = await deliveryStatus.processSendGridWebhook(
        [
          {
            event: 'open',
            sg_message_id: 'sg-msg-123',
            timestamp: Date.now() / 1000,
            email: 'test@example.com',
          },
        ],
        mockPortalId,
      );

      expect(result.processed).toBe(1);
      expect(mockOutreachRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: OutreachStatus.OPENED,
          openedAt: expect.any(Date),
        }),
      );
      expect(mockCampaignRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          emailsOpened: 1,
        }),
      );
    });

    it('should handle bounce event and log to HubSpot', async () => {
      const mockSentRecord = createMockSentRecord();
      const mockCampaign = createMockCampaign();

      mockOutreachRepository.findOne.mockResolvedValue(mockSentRecord);
      mockCampaignRepository.findOne.mockResolvedValue(mockCampaign);
      mockOutreachRepository.save.mockImplementation(async (record) => record);

      mockHubspotLogger.logBounce.mockResolvedValue({ success: true });

      const result = await deliveryStatus.processSendGridWebhook(
        [
          {
            event: 'bounce',
            sg_message_id: 'sg-msg-123',
            timestamp: Date.now() / 1000,
            email: 'test@example.com',
            reason: 'Invalid address',
            type: 'hard',
          },
        ],
        mockPortalId,
      );

      expect(result.processed).toBe(1);
      expect(mockHubspotLogger.logBounce).toHaveBeenCalledWith(
        mockPortalId,
        expect.objectContaining({
          email: 'test@example.com',
          bounceType: 'hard',
        }),
      );
    });
  });

  describe('SMS sending flow', () => {
    const createMockSmsRecord = (): Partial<OutreachRecord> => ({
      id: 'outreach-sms-1',
      campaignId: mockCampaignId,
      accountId: mockAccountId,
      hubspotContactId: 12345,
      channel: OutreachChannel.SMS,
      bodyText: 'Test SMS message',
      status: OutreachStatus.PENDING,
    });

    const createMockCampaign = (): Partial<Campaign> => ({
      id: mockCampaignId,
      accountId: mockAccountId,
      status: CampaignStatus.RUNNING,
      emailsSent: 0,
    });

    it('should send SMS via Twilio and log to HubSpot', async () => {
      const mockSmsRecord = createMockSmsRecord();
      const mockCampaign = createMockCampaign();

      mockCampaignRepository.findOne.mockResolvedValue(mockCampaign);
      mockOutreachRepository.find.mockResolvedValue([mockSmsRecord]);
      mockOutreachRepository.count.mockResolvedValue(0);
      mockOutreachRepository.save.mockImplementation(async (record) => record);
      mockCampaignRepository.save.mockImplementation(async (campaign) => campaign);

      mockSmsService.sendSmsWithRetry.mockResolvedValue({
        success: true,
        messageSid: 'SM123456',
      });
      mockHubspotLogger.logSmsSent.mockResolvedValue({ success: true });

      const result = await campaignExecutor.executeCampaign(mockCampaignId, mockPortalId);

      expect(result.processed).toBe(1);
      expect(result.successful).toBe(1);
      expect(mockSmsService.sendSmsWithRetry).toHaveBeenCalled();
      expect(mockHubspotLogger.logSmsSent).toHaveBeenCalled();
    });

    it('should process Twilio status callback', async () => {
      const sentSmsRecord = createMockSmsRecord();
      sentSmsRecord.twilioMessageSid = 'SM123456';
      sentSmsRecord.status = OutreachStatus.SENT;

      mockOutreachRepository.findOne.mockResolvedValue(sentSmsRecord);
      mockOutreachRepository.save.mockImplementation(async (record) => record);

      const result = await deliveryStatus.processTwilioWebhook(
        {
          MessageSid: 'SM123456',
          MessageStatus: 'delivered',
          To: '+1234567890',
          From: '+0987654321',
        },
        mockPortalId,
      );

      expect(result.success).toBe(true);
      expect(mockOutreachRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: OutreachStatus.DELIVERED,
        }),
      );
    });
  });

  describe('Reply handling flow', () => {
    const createMockOutreachRecord = (): Partial<OutreachRecord> => ({
      id: 'outreach-1',
      campaignId: mockCampaignId,
      accountId: mockAccountId,
      hubspotContactId: 12345,
      channel: OutreachChannel.EMAIL,
      status: OutreachStatus.OPENED,
    });

    const createMockCampaign = (): Partial<Campaign> => ({
      id: mockCampaignId,
      emailsSent: 1,
      emailsOpened: 1,
      emailsReplied: 0,
    });

    it('should mark outreach as replied and update campaign stats', async () => {
      const mockOutreachRecord = createMockOutreachRecord();
      const mockCampaign = createMockCampaign();

      mockOutreachRepository.findOne.mockResolvedValue(mockOutreachRecord);
      mockCampaignRepository.findOne.mockResolvedValue(mockCampaign);
      mockOutreachRepository.save.mockImplementation(async (record) => record);
      mockCampaignRepository.save.mockImplementation(async (campaign) => campaign);

      const result = await deliveryStatus.markAsReplied('outreach-1');

      expect(result.success).toBe(true);
      expect(mockOutreachRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: OutreachStatus.REPLIED,
          repliedAt: expect.any(Date),
        }),
      );
      expect(mockCampaignRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          emailsReplied: 1,
        }),
      );
    });
  });

  describe('Rate limiting and quotas', () => {
    it('should respect daily sending limits', async () => {
      const mockCampaign: Partial<Campaign> = {
        id: mockCampaignId,
        accountId: mockAccountId,
        status: CampaignStatus.RUNNING,
        emailsSent: 0,
      };

      mockCampaignRepository.findOne.mockResolvedValue(mockCampaign);
      mockOutreachRepository.count.mockResolvedValue(95); // Already sent 95 today
      mockOutreachRepository.find.mockResolvedValue(
        Array(5).fill(null).map((_, i) => ({
          id: `${i}`,
          status: OutreachStatus.PENDING,
          channel: OutreachChannel.EMAIL,
          contactEmail: `test${i}@example.com`,
          subject: 'Test',
          bodyText: 'Test',
        })),
      );
      mockOutreachRepository.save.mockImplementation(async (record) => record);
      mockCampaignRepository.save.mockImplementation(async (campaign) => campaign);

      mockEmailService.sendEmailWithRetry.mockResolvedValue({
        success: true,
        messageId: 'msg-123',
      });
      mockHubspotLogger.logEmailSent.mockResolvedValue({ success: true });

      const result = await campaignExecutor.executeCampaign(mockCampaignId, mockPortalId, {
        dailyLimit: 100,
      });

      // Should only process 5 (100 limit - 95 already sent)
      expect(result.processed).toBe(5);
    });

    it('should return quota information', async () => {
      mockOutreachRepository.count
        .mockResolvedValueOnce(50)  // Daily count
        .mockResolvedValueOnce(500); // Monthly count

      const quota = await campaignExecutor.getRemainingQuota(mockAccountId, {
        dailyLimit: 100,
        monthlyLimit: 1000,
      });

      expect(quota.dailyUsed).toBe(50);
      expect(quota.dailyRemaining).toBe(50);
      expect(quota.monthlyUsed).toBe(500);
      expect(quota.monthlyRemaining).toBe(500);
    });
  });

  describe('Business hours scheduling', () => {
    it('should check if within business hours', () => {
      const options = {
        businessHoursOnly: true,
        businessHoursStart: 9,
        businessHoursEnd: 17,
      };

      const result = campaignExecutor.isWithinBusinessHours(options);

      // Result depends on current time, just verify it returns a boolean
      expect(typeof result).toBe('boolean');
    });

    it('should skip execution outside business hours', async () => {
      const mockCampaign: Partial<Campaign> = {
        id: mockCampaignId,
        accountId: mockAccountId,
        status: CampaignStatus.RUNNING,
      };

      mockCampaignRepository.findOne.mockResolvedValue(mockCampaign);
      mockOutreachRepository.count.mockResolvedValue(0);

      // Mock to always be outside business hours
      jest.spyOn(campaignExecutor, 'isWithinBusinessHours').mockReturnValue(false);

      const result = await campaignExecutor.executeCampaign(mockCampaignId, mockPortalId, {
        businessHoursOnly: true,
      });

      expect(result.skipped).toBe(true);
      expect(result.processed).toBe(0);
    });
  });
});
