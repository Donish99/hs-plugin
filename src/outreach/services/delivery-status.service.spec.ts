import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DeliveryStatusService,
  SendGridEvent,
  TwilioStatusUpdate,
} from './delivery-status.service';
import { OutreachRecord, OutreachStatus, OutreachChannel } from '../../entities/outreach-record.entity';
import { HubspotLoggerService } from './hubspot-logger.service';
import { Campaign } from '../../entities/campaign.entity';

describe('DeliveryStatusService', () => {
  let service: DeliveryStatusService;
  let outreachRepository: jest.Mocked<Repository<OutreachRecord>>;
  let campaignRepository: jest.Mocked<Repository<Campaign>>;
  let hubspotLogger: jest.Mocked<HubspotLoggerService>;

  const mockPortalId = 123456;

  const createMockOutreachRecord = (): Partial<OutreachRecord> => ({
    id: 'outreach-123',
    campaignId: 'campaign-123',
    accountId: 'account-123',
    hubspotContactId: 12345,
    channel: OutreachChannel.EMAIL,
    contactEmail: 'test@example.com',
    sendgridMessageId: 'sg-msg-12345',
    status: OutreachStatus.SENT,
    sentAt: new Date(),
  });

  const createMockCampaign = (): Partial<Campaign> => ({
    id: 'campaign-123',
    emailsSent: 10,
    emailsOpened: 0,
    emailsReplied: 0,
  });

  let mockOutreachRecord: Partial<OutreachRecord>;
  let mockCampaign: Partial<Campaign>;

  const mockOutreachRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };

  const mockCampaignRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const mockHubspotLogger = {
    updateEngagementStatus: jest.fn(),
    logBounce: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeliveryStatusService,
        { provide: getRepositoryToken(OutreachRecord), useValue: mockOutreachRepository },
        { provide: getRepositoryToken(Campaign), useValue: mockCampaignRepository },
        { provide: HubspotLoggerService, useValue: mockHubspotLogger },
      ],
    }).compile();

    service = module.get<DeliveryStatusService>(DeliveryStatusService);
    outreachRepository = module.get(getRepositoryToken(OutreachRecord));
    campaignRepository = module.get(getRepositoryToken(Campaign));
    hubspotLogger = module.get(HubspotLoggerService);

    // Reset mock data for each test
    mockOutreachRecord = createMockOutreachRecord();
    mockCampaign = createMockCampaign();

    jest.clearAllMocks();
  });

  describe('processSendGridWebhook', () => {
    it('should update status to DELIVERED on delivery event', async () => {
      mockOutreachRepository.findOne.mockResolvedValue(mockOutreachRecord);
      mockCampaignRepository.findOne.mockResolvedValue(mockCampaign);
      mockOutreachRepository.save.mockResolvedValue(mockOutreachRecord);

      const event: SendGridEvent = {
        event: 'delivered',
        sg_message_id: 'sg-msg-12345',
        timestamp: Date.now() / 1000,
        email: 'test@example.com',
      };

      const result = await service.processSendGridWebhook([event], mockPortalId);

      expect(result.processed).toBe(1);
      expect(mockOutreachRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: OutreachStatus.DELIVERED,
        }),
      );
    });

    it('should update status to OPENED on open event', async () => {
      mockOutreachRepository.findOne.mockResolvedValue(mockOutreachRecord);
      mockCampaignRepository.findOne.mockResolvedValue(mockCampaign);
      mockOutreachRepository.save.mockResolvedValue(mockOutreachRecord);

      const event: SendGridEvent = {
        event: 'open',
        sg_message_id: 'sg-msg-12345',
        timestamp: Date.now() / 1000,
        email: 'test@example.com',
      };

      const result = await service.processSendGridWebhook([event], mockPortalId);

      expect(result.processed).toBe(1);
      expect(mockOutreachRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: OutreachStatus.OPENED,
          openedAt: expect.any(Date),
        }),
      );
    });

    it('should update status to CLICKED on click event', async () => {
      mockOutreachRepository.findOne.mockResolvedValue(mockOutreachRecord);
      mockCampaignRepository.findOne.mockResolvedValue(mockCampaign);
      mockOutreachRepository.save.mockResolvedValue(mockOutreachRecord);

      const event: SendGridEvent = {
        event: 'click',
        sg_message_id: 'sg-msg-12345',
        timestamp: Date.now() / 1000,
        email: 'test@example.com',
        url: 'https://example.com/link',
      };

      const result = await service.processSendGridWebhook([event], mockPortalId);

      expect(result.processed).toBe(1);
      expect(mockOutreachRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: OutreachStatus.CLICKED,
          clickedAt: expect.any(Date),
        }),
      );
    });

    it('should update status to BOUNCED on bounce event', async () => {
      mockOutreachRepository.findOne.mockResolvedValue(mockOutreachRecord);
      mockCampaignRepository.findOne.mockResolvedValue(mockCampaign);
      mockOutreachRepository.save.mockResolvedValue(mockOutreachRecord);
      mockHubspotLogger.logBounce.mockResolvedValue({ success: true });

      const event: SendGridEvent = {
        event: 'bounce',
        sg_message_id: 'sg-msg-12345',
        timestamp: Date.now() / 1000,
        email: 'test@example.com',
        reason: 'Invalid address',
        type: 'hard',
      };

      const result = await service.processSendGridWebhook([event], mockPortalId);

      expect(result.processed).toBe(1);
      expect(mockOutreachRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: OutreachStatus.BOUNCED,
        }),
      );
    });

    it('should log bounce to HubSpot', async () => {
      mockOutreachRepository.findOne.mockResolvedValue(mockOutreachRecord);
      mockCampaignRepository.findOne.mockResolvedValue(mockCampaign);
      mockOutreachRepository.save.mockResolvedValue(mockOutreachRecord);
      mockHubspotLogger.logBounce.mockResolvedValue({ success: true });

      const event: SendGridEvent = {
        event: 'bounce',
        sg_message_id: 'sg-msg-12345',
        timestamp: Date.now() / 1000,
        email: 'test@example.com',
        reason: 'Invalid address',
        type: 'hard',
      };

      await service.processSendGridWebhook([event], mockPortalId);

      expect(mockHubspotLogger.logBounce).toHaveBeenCalledWith(
        mockPortalId,
        expect.objectContaining({
          email: 'test@example.com',
          bounceType: 'hard',
        }),
      );
    });

    it('should update campaign statistics on open', async () => {
      mockOutreachRepository.findOne.mockResolvedValue(mockOutreachRecord);
      mockCampaignRepository.findOne.mockResolvedValue(mockCampaign);
      mockOutreachRepository.save.mockResolvedValue(mockOutreachRecord);
      mockCampaignRepository.save.mockResolvedValue(mockCampaign);

      const event: SendGridEvent = {
        event: 'open',
        sg_message_id: 'sg-msg-12345',
        timestamp: Date.now() / 1000,
        email: 'test@example.com',
      };

      await service.processSendGridWebhook([event], mockPortalId);

      expect(mockCampaignRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          emailsOpened: 1,
        }),
      );
    });

    it('should handle multiple events in batch', async () => {
      mockOutreachRepository.findOne.mockResolvedValue(mockOutreachRecord);
      mockCampaignRepository.findOne.mockResolvedValue(mockCampaign);
      mockOutreachRepository.save.mockResolvedValue(mockOutreachRecord);

      const events: SendGridEvent[] = [
        { event: 'delivered', sg_message_id: 'msg-1', timestamp: Date.now() / 1000, email: 'a@b.com' },
        { event: 'open', sg_message_id: 'msg-2', timestamp: Date.now() / 1000, email: 'c@d.com' },
      ];

      const result = await service.processSendGridWebhook(events, mockPortalId);

      expect(result.processed).toBe(2);
    });

    it('should skip unknown message IDs', async () => {
      mockOutreachRepository.findOne.mockResolvedValue(null);

      const event: SendGridEvent = {
        event: 'delivered',
        sg_message_id: 'unknown-id',
        timestamp: Date.now() / 1000,
        email: 'test@example.com',
      };

      const result = await service.processSendGridWebhook([event], mockPortalId);

      expect(result.processed).toBe(0);
      expect(result.skipped).toBe(1);
    });
  });

  describe('processTwilioWebhook', () => {
    const smsRecord: Partial<OutreachRecord> = {
      ...mockOutreachRecord,
      channel: OutreachChannel.SMS,
      twilioMessageSid: 'SM123456',
      sendgridMessageId: undefined,
    };

    it('should update status to DELIVERED on delivered status', async () => {
      mockOutreachRepository.findOne.mockResolvedValue(smsRecord);
      mockOutreachRepository.save.mockResolvedValue(smsRecord);

      const update: TwilioStatusUpdate = {
        MessageSid: 'SM123456',
        MessageStatus: 'delivered',
        To: '+1234567890',
        From: '+0987654321',
      };

      const result = await service.processTwilioWebhook(update, mockPortalId);

      expect(result.success).toBe(true);
      expect(mockOutreachRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: OutreachStatus.DELIVERED,
        }),
      );
    });

    it('should update status to FAILED on failed status', async () => {
      mockOutreachRepository.findOne.mockResolvedValue(smsRecord);
      mockOutreachRepository.save.mockResolvedValue(smsRecord);

      const update: TwilioStatusUpdate = {
        MessageSid: 'SM123456',
        MessageStatus: 'failed',
        To: '+1234567890',
        From: '+0987654321',
        ErrorCode: '30003',
        ErrorMessage: 'Unreachable destination',
      };

      const result = await service.processTwilioWebhook(update, mockPortalId);

      expect(result.success).toBe(true);
      expect(mockOutreachRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: OutreachStatus.FAILED,
        }),
      );
    });

    it('should handle undelivered status', async () => {
      mockOutreachRepository.findOne.mockResolvedValue(smsRecord);
      mockOutreachRepository.save.mockResolvedValue(smsRecord);

      const update: TwilioStatusUpdate = {
        MessageSid: 'SM123456',
        MessageStatus: 'undelivered',
        To: '+1234567890',
        From: '+0987654321',
      };

      const result = await service.processTwilioWebhook(update, mockPortalId);

      expect(result.success).toBe(true);
      expect(mockOutreachRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: OutreachStatus.FAILED,
        }),
      );
    });
  });

  describe('status mapping', () => {
    it('should map SendGrid events to statuses correctly', () => {
      expect(service.mapSendGridEventToStatus('processed')).toBe(OutreachStatus.SENT);
      expect(service.mapSendGridEventToStatus('delivered')).toBe(OutreachStatus.DELIVERED);
      expect(service.mapSendGridEventToStatus('open')).toBe(OutreachStatus.OPENED);
      expect(service.mapSendGridEventToStatus('click')).toBe(OutreachStatus.CLICKED);
      expect(service.mapSendGridEventToStatus('bounce')).toBe(OutreachStatus.BOUNCED);
      expect(service.mapSendGridEventToStatus('dropped')).toBe(OutreachStatus.FAILED);
    });

    it('should map Twilio statuses correctly', () => {
      expect(service.mapTwilioStatusToOutreachStatus('queued')).toBe(OutreachStatus.PENDING);
      expect(service.mapTwilioStatusToOutreachStatus('sent')).toBe(OutreachStatus.SENT);
      expect(service.mapTwilioStatusToOutreachStatus('delivered')).toBe(OutreachStatus.DELIVERED);
      expect(service.mapTwilioStatusToOutreachStatus('failed')).toBe(OutreachStatus.FAILED);
      expect(service.mapTwilioStatusToOutreachStatus('undelivered')).toBe(OutreachStatus.FAILED);
    });
  });

  describe('getOutreachStatus', () => {
    it('should return current status of outreach record', async () => {
      mockOutreachRepository.findOne.mockResolvedValue(mockOutreachRecord);

      const status = await service.getOutreachStatus('outreach-123');

      expect(status).toBe(OutreachStatus.SENT);
    });

    it('should return null for unknown record', async () => {
      mockOutreachRepository.findOne.mockResolvedValue(null);

      const status = await service.getOutreachStatus('unknown');

      expect(status).toBeNull();
    });
  });

  describe('markAsReplied', () => {
    it('should update status to REPLIED', async () => {
      mockOutreachRepository.findOne.mockResolvedValue(mockOutreachRecord);
      mockCampaignRepository.findOne.mockResolvedValue(mockCampaign);
      mockOutreachRepository.save.mockResolvedValue(mockOutreachRecord);
      mockCampaignRepository.save.mockResolvedValue(mockCampaign);

      const result = await service.markAsReplied('outreach-123');

      expect(result.success).toBe(true);
      expect(mockOutreachRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: OutreachStatus.REPLIED,
          repliedAt: expect.any(Date),
        }),
      );
    });

    it('should update campaign replied count', async () => {
      mockOutreachRepository.findOne.mockResolvedValue(mockOutreachRecord);
      mockCampaignRepository.findOne.mockResolvedValue(mockCampaign);
      mockOutreachRepository.save.mockResolvedValue(mockOutreachRecord);
      mockCampaignRepository.save.mockResolvedValue(mockCampaign);

      await service.markAsReplied('outreach-123');

      expect(mockCampaignRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          emailsReplied: 1,
        }),
      );
    });
  });
});
