import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  WebhooksService,
  WebhookEvent,
  WebhookEventType,
  WebhookValidationResult,
  ProcessedWebhookEvent,
} from './webhooks.service';
import { Queue } from 'bull';
import { getQueueToken } from '@nestjs/bull';
import * as crypto from 'crypto';

describe('WebhooksService', () => {
  let service: WebhooksService;
  let configService: jest.Mocked<ConfigService>;
  let webhookQueue: jest.Mocked<Queue>;

  const mockClientSecret = 'test-client-secret-12345';
  const mockAppUrl = 'https://app.example.com';

  const mockConfigService = {
    get: jest.fn(),
    getOrThrow: jest.fn(),
  };

  const mockQueue = {
    add: jest.fn(),
    getJobCounts: jest.fn(),
  };

  beforeEach(async () => {
    mockConfigService.getOrThrow.mockImplementation((key: string) => {
      if (key === 'HUBSPOT_CLIENT_SECRET') return mockClientSecret;
      if (key === 'APP_URL') return mockAppUrl;
      return '';
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: getQueueToken('webhook-processing'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<WebhooksService>(WebhooksService);
    configService = module.get(ConfigService);
    webhookQueue = module.get(getQueueToken('webhook-processing'));

    jest.clearAllMocks();
  });

  describe('validateSignature', () => {
    const createValidSignature = (
      method: string,
      url: string,
      body: string,
      timestamp: string,
    ): string => {
      const sourceString = `${method}${url}${body}${timestamp}`;
      return crypto
        .createHmac('sha256', mockClientSecret)
        .update(sourceString)
        .digest('base64');
    };

    it('should validate a correct signature', () => {
      const method = 'POST';
      const url = `${mockAppUrl}/api/hubspot/webhooks`;
      const body = JSON.stringify([{ eventType: 'contact.propertyChange' }]);
      const timestamp = Date.now().toString();
      const signature = createValidSignature(method, url, body, timestamp);

      const result = service.validateSignature({
        signature,
        timestamp,
        method,
        url,
        body,
      });

      expect(result.valid).toBe(true);
    });

    it('should reject an invalid signature', () => {
      const result = service.validateSignature({
        signature: 'invalid-signature',
        timestamp: Date.now().toString(),
        method: 'POST',
        url: `${mockAppUrl}/api/hubspot/webhooks`,
        body: '[]',
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Invalid signature');
    });

    it('should reject stale requests older than 5 minutes', () => {
      const staleTimestamp = (Date.now() - 6 * 60 * 1000).toString(); // 6 minutes ago
      const method = 'POST';
      const url = `${mockAppUrl}/api/hubspot/webhooks`;
      const body = '[]';
      const signature = createValidSignature(method, url, body, staleTimestamp);

      const result = service.validateSignature({
        signature,
        timestamp: staleTimestamp,
        method,
        url,
        body,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('stale');
    });

    it('should accept requests within 5 minute window', () => {
      const recentTimestamp = (Date.now() - 4 * 60 * 1000).toString(); // 4 minutes ago
      const method = 'POST';
      const url = `${mockAppUrl}/api/hubspot/webhooks`;
      const body = '[]';
      const signature = createValidSignature(method, url, body, recentTimestamp);

      const result = service.validateSignature({
        signature,
        timestamp: recentTimestamp,
        method,
        url,
        body,
      });

      expect(result.valid).toBe(true);
    });

    it('should handle missing signature', () => {
      const result = service.validateSignature({
        signature: '',
        timestamp: Date.now().toString(),
        method: 'POST',
        url: `${mockAppUrl}/api/hubspot/webhooks`,
        body: '[]',
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Missing');
    });

    it('should handle missing timestamp', () => {
      const result = service.validateSignature({
        signature: 'some-signature',
        timestamp: '',
        method: 'POST',
        url: `${mockAppUrl}/api/hubspot/webhooks`,
        body: '[]',
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Missing');
    });
  });

  describe('parseWebhookPayload', () => {
    it('should parse a single webhook event', () => {
      const payload = [
        {
          eventId: 123456,
          subscriptionId: 789,
          portalId: 12345,
          occurredAt: Date.now(),
          subscriptionType: 'contact.propertyChange',
          attemptNumber: 0,
          objectId: 111,
          propertyName: 'email',
          propertyValue: 'test@example.com',
        },
      ];

      const events = service.parseWebhookPayload(JSON.stringify(payload));

      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe(WebhookEventType.CONTACT_PROPERTY_CHANGE);
      expect(events[0].portalId).toBe(12345);
      expect(events[0].objectId).toBe(111);
    });

    it('should parse batch webhook events', () => {
      const payload = [
        {
          eventId: 1,
          subscriptionId: 789,
          portalId: 12345,
          occurredAt: Date.now(),
          subscriptionType: 'contact.propertyChange',
          attemptNumber: 0,
          objectId: 111,
          propertyName: 'email',
        },
        {
          eventId: 2,
          subscriptionId: 790,
          portalId: 12345,
          occurredAt: Date.now(),
          subscriptionType: 'deal.propertyChange',
          attemptNumber: 0,
          objectId: 222,
          propertyName: 'dealstage',
        },
      ];

      const events = service.parseWebhookPayload(JSON.stringify(payload));

      expect(events).toHaveLength(2);
      expect(events[0].eventType).toBe(WebhookEventType.CONTACT_PROPERTY_CHANGE);
      expect(events[1].eventType).toBe(WebhookEventType.DEAL_PROPERTY_CHANGE);
    });

    it('should handle contact.creation events', () => {
      const payload = [
        {
          eventId: 1,
          subscriptionId: 789,
          portalId: 12345,
          occurredAt: Date.now(),
          subscriptionType: 'contact.creation',
          attemptNumber: 0,
          objectId: 111,
        },
      ];

      const events = service.parseWebhookPayload(JSON.stringify(payload));

      expect(events[0].eventType).toBe(WebhookEventType.CONTACT_CREATION);
    });

    it('should handle contact.deletion events', () => {
      const payload = [
        {
          eventId: 1,
          subscriptionId: 789,
          portalId: 12345,
          occurredAt: Date.now(),
          subscriptionType: 'contact.deletion',
          attemptNumber: 0,
          objectId: 111,
        },
      ];

      const events = service.parseWebhookPayload(JSON.stringify(payload));

      expect(events[0].eventType).toBe(WebhookEventType.CONTACT_DELETION);
    });

    it('should handle invalid JSON gracefully', () => {
      expect(() => service.parseWebhookPayload('invalid json')).toThrow();
    });

    it('should handle empty payload', () => {
      const events = service.parseWebhookPayload('[]');

      expect(events).toHaveLength(0);
    });
  });

  describe('queueEvents', () => {
    it('should add events to the processing queue', async () => {
      mockQueue.add.mockResolvedValue({ id: 'job-1' });

      const events: WebhookEvent[] = [
        {
          eventId: '123',
          eventType: WebhookEventType.CONTACT_PROPERTY_CHANGE,
          portalId: 12345,
          objectId: 111,
          occurredAt: new Date(),
          subscriptionType: 'contact.propertyChange',
          propertyName: 'email',
          propertyValue: 'test@example.com',
        },
      ];

      const result = await service.queueEvents(events);

      expect(result.queued).toBe(1);
      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'process-webhook',
        expect.objectContaining({
          eventId: '123',
          eventType: WebhookEventType.CONTACT_PROPERTY_CHANGE,
        }),
        expect.any(Object),
      );
    });

    it('should add multiple events to queue', async () => {
      mockQueue.add.mockResolvedValue({ id: 'job-1' });

      const events: WebhookEvent[] = [
        {
          eventId: '1',
          eventType: WebhookEventType.CONTACT_PROPERTY_CHANGE,
          portalId: 12345,
          objectId: 111,
          occurredAt: new Date(),
          subscriptionType: 'contact.propertyChange',
        },
        {
          eventId: '2',
          eventType: WebhookEventType.DEAL_PROPERTY_CHANGE,
          portalId: 12345,
          objectId: 222,
          occurredAt: new Date(),
          subscriptionType: 'deal.propertyChange',
        },
      ];

      const result = await service.queueEvents(events);

      expect(result.queued).toBe(2);
      expect(mockQueue.add).toHaveBeenCalledTimes(2);
    });

    it('should handle queue failures gracefully', async () => {
      mockQueue.add
        .mockResolvedValueOnce({ id: 'job-1' })
        .mockRejectedValueOnce(new Error('Queue error'));

      const events: WebhookEvent[] = [
        {
          eventId: '1',
          eventType: WebhookEventType.CONTACT_PROPERTY_CHANGE,
          portalId: 12345,
          objectId: 111,
          occurredAt: new Date(),
          subscriptionType: 'contact.propertyChange',
        },
        {
          eventId: '2',
          eventType: WebhookEventType.DEAL_PROPERTY_CHANGE,
          portalId: 12345,
          objectId: 222,
          occurredAt: new Date(),
          subscriptionType: 'deal.propertyChange',
        },
      ];

      const result = await service.queueEvents(events);

      expect(result.queued).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
    });

    it('should set appropriate job options', async () => {
      mockQueue.add.mockResolvedValue({ id: 'job-1' });

      const events: WebhookEvent[] = [
        {
          eventId: '123',
          eventType: WebhookEventType.CONTACT_PROPERTY_CHANGE,
          portalId: 12345,
          objectId: 111,
          occurredAt: new Date(),
          subscriptionType: 'contact.propertyChange',
        },
      ];

      await service.queueEvents(events);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'process-webhook',
        expect.any(Object),
        expect.objectContaining({
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: true,
        }),
      );
    });
  });

  describe('isEmailReplyEvent', () => {
    it('should identify email reply events', () => {
      const event: WebhookEvent = {
        eventId: '1',
        eventType: WebhookEventType.CONTACT_PROPERTY_CHANGE,
        portalId: 12345,
        objectId: 111,
        occurredAt: new Date(),
        subscriptionType: 'contact.propertyChange',
        propertyName: 'hs_sales_email_last_replied',
        propertyValue: new Date().toISOString(),
      };

      expect(service.isEmailReplyEvent(event)).toBe(true);
    });

    it('should not identify non-reply property changes as replies', () => {
      const event: WebhookEvent = {
        eventId: '1',
        eventType: WebhookEventType.CONTACT_PROPERTY_CHANGE,
        portalId: 12345,
        objectId: 111,
        occurredAt: new Date(),
        subscriptionType: 'contact.propertyChange',
        propertyName: 'email',
        propertyValue: 'test@example.com',
      };

      expect(service.isEmailReplyEvent(event)).toBe(false);
    });
  });

  describe('isEmailOpenEvent', () => {
    it('should identify email open events', () => {
      const event: WebhookEvent = {
        eventId: '1',
        eventType: WebhookEventType.CONTACT_PROPERTY_CHANGE,
        portalId: 12345,
        objectId: 111,
        occurredAt: new Date(),
        subscriptionType: 'contact.propertyChange',
        propertyName: 'hs_email_last_open_date',
        propertyValue: new Date().toISOString(),
      };

      expect(service.isEmailOpenEvent(event)).toBe(true);
    });
  });

  describe('isEmailClickEvent', () => {
    it('should identify email click events', () => {
      const event: WebhookEvent = {
        eventId: '1',
        eventType: WebhookEventType.CONTACT_PROPERTY_CHANGE,
        portalId: 12345,
        objectId: 111,
        occurredAt: new Date(),
        subscriptionType: 'contact.propertyChange',
        propertyName: 'hs_email_last_click_date',
        propertyValue: new Date().toISOString(),
      };

      expect(service.isEmailClickEvent(event)).toBe(true);
    });
  });

  describe('isDealStageChangeEvent', () => {
    it('should identify deal stage change events', () => {
      const event: WebhookEvent = {
        eventId: '1',
        eventType: WebhookEventType.DEAL_PROPERTY_CHANGE,
        portalId: 12345,
        objectId: 222,
        occurredAt: new Date(),
        subscriptionType: 'deal.propertyChange',
        propertyName: 'dealstage',
        propertyValue: 'closedwon',
      };

      expect(service.isDealStageChangeEvent(event)).toBe(true);
    });

    it('should not identify other deal property changes', () => {
      const event: WebhookEvent = {
        eventId: '1',
        eventType: WebhookEventType.DEAL_PROPERTY_CHANGE,
        portalId: 12345,
        objectId: 222,
        occurredAt: new Date(),
        subscriptionType: 'deal.propertyChange',
        propertyName: 'amount',
        propertyValue: '5000',
      };

      expect(service.isDealStageChangeEvent(event)).toBe(false);
    });
  });

  describe('getWebhookEndpointUrl', () => {
    it('should return the correct webhook URL', () => {
      const url = service.getWebhookEndpointUrl();

      expect(url).toBe(`${mockAppUrl}/api/hubspot/webhooks`);
    });
  });

  describe('getSupportedSubscriptions', () => {
    it('should return list of supported webhook subscriptions', () => {
      const subscriptions = service.getSupportedSubscriptions();

      expect(subscriptions).toContain('contact.propertyChange');
      expect(subscriptions).toContain('deal.propertyChange');
      expect(subscriptions).toContain('contact.creation');
      expect(subscriptions).toContain('contact.deletion');
    });
  });

  describe('deduplicateEvents', () => {
    it('should remove duplicate events by eventId', () => {
      const events: WebhookEvent[] = [
        {
          eventId: '1',
          eventType: WebhookEventType.CONTACT_PROPERTY_CHANGE,
          portalId: 12345,
          objectId: 111,
          occurredAt: new Date(),
          subscriptionType: 'contact.propertyChange',
        },
        {
          eventId: '1', // Duplicate
          eventType: WebhookEventType.CONTACT_PROPERTY_CHANGE,
          portalId: 12345,
          objectId: 111,
          occurredAt: new Date(),
          subscriptionType: 'contact.propertyChange',
        },
        {
          eventId: '2',
          eventType: WebhookEventType.DEAL_PROPERTY_CHANGE,
          portalId: 12345,
          objectId: 222,
          occurredAt: new Date(),
          subscriptionType: 'deal.propertyChange',
        },
      ];

      const unique = service.deduplicateEvents(events);

      expect(unique).toHaveLength(2);
      expect(unique.map((e) => e.eventId)).toEqual(['1', '2']);
    });
  });
});
