import { Test, TestingModule } from '@nestjs/testing';
import { WebhooksController } from './webhooks.controller';
import {
  WebhooksService,
  WebhookEventType,
  WebhookEvent,
} from '../services/webhooks.service';

describe('WebhooksController', () => {
  let controller: WebhooksController;
  let webhooksService: jest.Mocked<WebhooksService>;

  const mockWebhooksService = {
    validateSignature: jest.fn(),
    parseWebhookPayload: jest.fn(),
    queueEvents: jest.fn(),
    deduplicateEvents: jest.fn(),
    getWebhookEndpointUrl: jest.fn(),
    getSupportedSubscriptions: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [
        { provide: WebhooksService, useValue: mockWebhooksService },
      ],
    }).compile();

    controller = module.get<WebhooksController>(WebhooksController);
    webhooksService = module.get(WebhooksService);

    jest.clearAllMocks();
  });

  describe('handleWebhook', () => {
    const mockEvents: WebhookEvent[] = [
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

    it('should process valid webhook request', async () => {
      mockWebhooksService.validateSignature.mockReturnValue({ valid: true });
      mockWebhooksService.parseWebhookPayload.mockReturnValue(mockEvents);
      mockWebhooksService.deduplicateEvents.mockReturnValue(mockEvents);
      mockWebhooksService.queueEvents.mockResolvedValue({
        queued: 1,
        failed: 0,
        errors: [],
      });

      const mockRequest = {
        headers: {
          'x-hubspot-signature-v3': 'valid-signature',
          'x-hubspot-request-timestamp': Date.now().toString(),
          'host': 'app.example.com',
        },
        method: 'POST',
        url: '/api/hubspot/webhooks',
        originalUrl: '/api/hubspot/webhooks',
        protocol: 'https',
        rawBody: JSON.stringify([{ eventId: 123 }]),
        get: (header: string) => mockRequest.headers[header as keyof typeof mockRequest.headers],
      };

      const result = await controller.handleWebhook(
        mockRequest.rawBody,
        mockRequest.headers['x-hubspot-signature-v3'],
        mockRequest.headers['x-hubspot-request-timestamp'],
        mockRequest as any,
      );

      expect(result).toEqual({ received: true, queued: 1 });
      expect(mockWebhooksService.validateSignature).toHaveBeenCalled();
      expect(mockWebhooksService.parseWebhookPayload).toHaveBeenCalled();
      expect(mockWebhooksService.queueEvents).toHaveBeenCalled();
    });

    it('should reject invalid signature', async () => {
      mockWebhooksService.validateSignature.mockReturnValue({
        valid: false,
        reason: 'Invalid signature',
      });

      const mockRequest = {
        headers: {
          'x-hubspot-signature-v3': 'invalid-signature',
          'x-hubspot-request-timestamp': Date.now().toString(),
          'host': 'app.example.com',
        },
        method: 'POST',
        url: '/api/hubspot/webhooks',
        originalUrl: '/api/hubspot/webhooks',
        protocol: 'https',
        rawBody: '[]',
        get: (header: string) => mockRequest.headers[header as keyof typeof mockRequest.headers],
      };

      await expect(
        controller.handleWebhook(
          mockRequest.rawBody,
          mockRequest.headers['x-hubspot-signature-v3'],
          mockRequest.headers['x-hubspot-request-timestamp'],
          mockRequest as any,
        ),
      ).rejects.toThrow('Invalid signature');
    });

    it('should reject stale requests', async () => {
      mockWebhooksService.validateSignature.mockReturnValue({
        valid: false,
        reason: 'Request is stale',
      });

      const mockRequest = {
        headers: {
          'x-hubspot-signature-v3': 'valid-signature',
          'x-hubspot-request-timestamp': (Date.now() - 6 * 60 * 1000).toString(),
          'host': 'app.example.com',
        },
        method: 'POST',
        url: '/api/hubspot/webhooks',
        originalUrl: '/api/hubspot/webhooks',
        protocol: 'https',
        rawBody: '[]',
        get: (header: string) => mockRequest.headers[header as keyof typeof mockRequest.headers],
      };

      await expect(
        controller.handleWebhook(
          mockRequest.rawBody,
          mockRequest.headers['x-hubspot-signature-v3'],
          mockRequest.headers['x-hubspot-request-timestamp'],
          mockRequest as any,
        ),
      ).rejects.toThrow();
    });

    it('should handle batch webhook payloads', async () => {
      const batchEvents: WebhookEvent[] = [
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
        {
          eventId: '3',
          eventType: WebhookEventType.CONTACT_CREATION,
          portalId: 12345,
          objectId: 333,
          occurredAt: new Date(),
          subscriptionType: 'contact.creation',
        },
      ];

      mockWebhooksService.validateSignature.mockReturnValue({ valid: true });
      mockWebhooksService.parseWebhookPayload.mockReturnValue(batchEvents);
      mockWebhooksService.deduplicateEvents.mockReturnValue(batchEvents);
      mockWebhooksService.queueEvents.mockResolvedValue({
        queued: 3,
        failed: 0,
        errors: [],
      });

      const mockRequest = {
        headers: {
          'x-hubspot-signature-v3': 'valid-signature',
          'x-hubspot-request-timestamp': Date.now().toString(),
          'host': 'app.example.com',
        },
        method: 'POST',
        url: '/api/hubspot/webhooks',
        originalUrl: '/api/hubspot/webhooks',
        protocol: 'https',
        rawBody: JSON.stringify([{ eventId: 1 }, { eventId: 2 }, { eventId: 3 }]),
        get: (header: string) => mockRequest.headers[header as keyof typeof mockRequest.headers],
      };

      const result = await controller.handleWebhook(
        mockRequest.rawBody,
        mockRequest.headers['x-hubspot-signature-v3'],
        mockRequest.headers['x-hubspot-request-timestamp'],
        mockRequest as any,
      );

      expect(result).toEqual({ received: true, queued: 3 });
    });

    it('should deduplicate events before queueing', async () => {
      const duplicateEvents: WebhookEvent[] = [
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
      ];

      const uniqueEvents = [duplicateEvents[0]];

      mockWebhooksService.validateSignature.mockReturnValue({ valid: true });
      mockWebhooksService.parseWebhookPayload.mockReturnValue(duplicateEvents);
      mockWebhooksService.deduplicateEvents.mockReturnValue(uniqueEvents);
      mockWebhooksService.queueEvents.mockResolvedValue({
        queued: 1,
        failed: 0,
        errors: [],
      });

      const mockRequest = {
        headers: {
          'x-hubspot-signature-v3': 'valid-signature',
          'x-hubspot-request-timestamp': Date.now().toString(),
          'host': 'app.example.com',
        },
        method: 'POST',
        url: '/api/hubspot/webhooks',
        originalUrl: '/api/hubspot/webhooks',
        protocol: 'https',
        rawBody: '[]',
        get: (header: string) => mockRequest.headers[header as keyof typeof mockRequest.headers],
      };

      await controller.handleWebhook(
        mockRequest.rawBody,
        mockRequest.headers['x-hubspot-signature-v3'],
        mockRequest.headers['x-hubspot-request-timestamp'],
        mockRequest as any,
      );

      expect(mockWebhooksService.deduplicateEvents).toHaveBeenCalledWith(duplicateEvents);
      expect(mockWebhooksService.queueEvents).toHaveBeenCalledWith(uniqueEvents);
    });

    it('should return within 1 second', async () => {
      mockWebhooksService.validateSignature.mockReturnValue({ valid: true });
      mockWebhooksService.parseWebhookPayload.mockReturnValue(mockEvents);
      mockWebhooksService.deduplicateEvents.mockReturnValue(mockEvents);
      mockWebhooksService.queueEvents.mockResolvedValue({
        queued: 1,
        failed: 0,
        errors: [],
      });

      const mockRequest = {
        headers: {
          'x-hubspot-signature-v3': 'valid-signature',
          'x-hubspot-request-timestamp': Date.now().toString(),
          'host': 'app.example.com',
        },
        method: 'POST',
        url: '/api/hubspot/webhooks',
        originalUrl: '/api/hubspot/webhooks',
        protocol: 'https',
        rawBody: '[]',
        get: (header: string) => mockRequest.headers[header as keyof typeof mockRequest.headers],
      };

      const startTime = Date.now();

      await controller.handleWebhook(
        mockRequest.rawBody,
        mockRequest.headers['x-hubspot-signature-v3'],
        mockRequest.headers['x-hubspot-request-timestamp'],
        mockRequest as any,
      );

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(1000);
    });

    it('should handle empty payload', async () => {
      mockWebhooksService.validateSignature.mockReturnValue({ valid: true });
      mockWebhooksService.parseWebhookPayload.mockReturnValue([]);
      mockWebhooksService.deduplicateEvents.mockReturnValue([]);
      mockWebhooksService.queueEvents.mockResolvedValue({
        queued: 0,
        failed: 0,
        errors: [],
      });

      const mockRequest = {
        headers: {
          'x-hubspot-signature-v3': 'valid-signature',
          'x-hubspot-request-timestamp': Date.now().toString(),
          'host': 'app.example.com',
        },
        method: 'POST',
        url: '/api/hubspot/webhooks',
        originalUrl: '/api/hubspot/webhooks',
        protocol: 'https',
        rawBody: '[]',
        get: (header: string) => mockRequest.headers[header as keyof typeof mockRequest.headers],
      };

      const result = await controller.handleWebhook(
        mockRequest.rawBody,
        mockRequest.headers['x-hubspot-signature-v3'],
        mockRequest.headers['x-hubspot-request-timestamp'],
        mockRequest as any,
      );

      expect(result).toEqual({ received: true, queued: 0 });
    });

    it('should handle parse errors', async () => {
      mockWebhooksService.validateSignature.mockReturnValue({ valid: true });
      mockWebhooksService.parseWebhookPayload.mockImplementation(() => {
        throw new Error('Invalid JSON');
      });

      const mockRequest = {
        headers: {
          'x-hubspot-signature-v3': 'valid-signature',
          'x-hubspot-request-timestamp': Date.now().toString(),
          'host': 'app.example.com',
        },
        method: 'POST',
        url: '/api/hubspot/webhooks',
        originalUrl: '/api/hubspot/webhooks',
        protocol: 'https',
        rawBody: 'invalid json',
        get: (header: string) => mockRequest.headers[header as keyof typeof mockRequest.headers],
      };

      await expect(
        controller.handleWebhook(
          mockRequest.rawBody,
          mockRequest.headers['x-hubspot-signature-v3'],
          mockRequest.headers['x-hubspot-request-timestamp'],
          mockRequest as any,
        ),
      ).rejects.toThrow();
    });
  });

  describe('getWebhookInfo', () => {
    it('should return webhook configuration info', () => {
      mockWebhooksService.getWebhookEndpointUrl.mockReturnValue(
        'https://app.example.com/api/hubspot/webhooks',
      );
      mockWebhooksService.getSupportedSubscriptions.mockReturnValue([
        'contact.propertyChange',
        'deal.propertyChange',
      ]);

      const result = controller.getWebhookInfo();

      expect(result.endpointUrl).toBe('https://app.example.com/api/hubspot/webhooks');
      expect(result.subscriptions).toContain('contact.propertyChange');
    });
  });
});
