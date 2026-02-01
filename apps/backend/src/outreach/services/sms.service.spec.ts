import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SmsService, SmsMessage, SmsResult, SmsOptions } from './sms.service';
import {
  createMockTwilioClient,
  mockTwilioSuccessResponse,
  mockTwilioErrorResponse,
} from '../../test/mocks/twilio.mock';

describe('SmsService', () => {
  let service: SmsService;
  let mockTwilioClient: ReturnType<typeof createMockTwilioClient>;
  let configService: jest.Mocked<ConfigService>;

  const mockConfig = {
    twilioAccountSid: 'ACtest123',
    twilioAuthToken: 'auth-token-123',
    twilioPhoneNumber: '+15551234567',
  };

  beforeEach(async () => {
    mockTwilioClient = createMockTwilioClient();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmsService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const configMap: Record<string, any> = {
                'twilio.accountSid': mockConfig.twilioAccountSid,
                'twilio.authToken': mockConfig.twilioAuthToken,
                'twilio.phoneNumber': mockConfig.twilioPhoneNumber,
              };
              return configMap[key];
            }),
          },
        },
        {
          provide: 'TWILIO_CLIENT',
          useValue: mockTwilioClient,
        },
      ],
    }).compile();

    service = module.get<SmsService>(SmsService);
    configService = module.get(ConfigService);
  });

  describe('sendSms', () => {
    const mockMessage: SmsMessage = {
      to: '+1234567890',
      body: 'Test SMS message',
    };

    it('should send SMS successfully', async () => {
      mockTwilioClient.messages.create.mockResolvedValue(mockTwilioSuccessResponse);

      const result = await service.sendSms(mockMessage);

      expect(result.success).toBe(true);
      expect(result.messageSid).toBe('SM1234567890abcdef');
      expect(mockTwilioClient.messages.create).toHaveBeenCalledTimes(1);
    });

    it('should use configured from number', async () => {
      mockTwilioClient.messages.create.mockResolvedValue(mockTwilioSuccessResponse);

      await service.sendSms(mockMessage);

      expect(mockTwilioClient.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          from: mockConfig.twilioPhoneNumber,
        }),
      );
    });

    it('should handle custom from number', async () => {
      mockTwilioClient.messages.create.mockResolvedValue(mockTwilioSuccessResponse);

      const options: SmsOptions = {
        fromNumber: '+15559876543',
      };

      await service.sendSms(mockMessage, options);

      expect(mockTwilioClient.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          from: '+15559876543',
        }),
      );
    });
  });

  describe('consent verification', () => {
    it('should require consent before sending', async () => {
      const result = await service.sendSms(
        { to: '+1234567890', body: 'Test' },
        { requireConsent: true, hasConsent: false },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('consent');
      expect(mockTwilioClient.messages.create).not.toHaveBeenCalled();
    });

    it('should send when consent is given', async () => {
      mockTwilioClient.messages.create.mockResolvedValue(mockTwilioSuccessResponse);

      const result = await service.sendSms(
        { to: '+1234567890', body: 'Test' },
        { requireConsent: true, hasConsent: true },
      );

      expect(result.success).toBe(true);
    });

    it('should skip consent check when not required', async () => {
      mockTwilioClient.messages.create.mockResolvedValue(mockTwilioSuccessResponse);

      const result = await service.sendSms(
        { to: '+1234567890', body: 'Test' },
        { requireConsent: false },
      );

      expect(result.success).toBe(true);
    });
  });

  describe('character limit handling', () => {
    it('should accept messages within limit', async () => {
      mockTwilioClient.messages.create.mockResolvedValue(mockTwilioSuccessResponse);

      const shortMessage: SmsMessage = {
        to: '+1234567890',
        body: 'Short message',
      };

      const result = await service.sendSms(shortMessage);

      expect(result.success).toBe(true);
    });

    it('should warn when message exceeds single segment', async () => {
      mockTwilioClient.messages.create.mockResolvedValue({
        ...mockTwilioSuccessResponse,
        numSegments: '2',
      });

      const longMessage: SmsMessage = {
        to: '+1234567890',
        body: 'A'.repeat(170), // More than 160 characters
      };

      const result = await service.sendSms(longMessage);

      expect(result.success).toBe(true);
      expect(result.segments).toBe(2);
    });

    it('should reject messages over absolute limit', async () => {
      const tooLongMessage: SmsMessage = {
        to: '+1234567890',
        body: 'A'.repeat(1601), // Over 1600 character limit
      };

      const result = await service.sendSms(tooLongMessage);

      expect(result.success).toBe(false);
      expect(result.error).toContain('exceeds maximum');
    });

    it('should calculate segments correctly', () => {
      expect(service.calculateSegments('Short')).toBe(1);
      expect(service.calculateSegments('A'.repeat(160))).toBe(1);
      expect(service.calculateSegments('A'.repeat(161))).toBe(2);
      // With concatenation headers (153 chars per segment), 320 chars = 3 segments
      expect(service.calculateSegments('A'.repeat(306))).toBe(2);
      expect(service.calculateSegments('A'.repeat(307))).toBe(3);
    });
  });

  describe('opt-out handling', () => {
    it('should detect opt-out keywords', () => {
      expect(service.isOptOutMessage('STOP')).toBe(true);
      expect(service.isOptOutMessage('stop')).toBe(true);
      expect(service.isOptOutMessage('UNSUBSCRIBE')).toBe(true);
      expect(service.isOptOutMessage('CANCEL')).toBe(true);
      expect(service.isOptOutMessage('Hello there')).toBe(false);
    });

    it('should not send to opted-out numbers', async () => {
      const result = await service.sendSms(
        { to: '+1234567890', body: 'Test' },
        { isOptedOut: true },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('opted out');
      expect(mockTwilioClient.messages.create).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    const mockMessage: SmsMessage = {
      to: '+1234567890',
      body: 'Test message',
    };

    it('should handle Twilio API errors', async () => {
      mockTwilioClient.messages.create.mockRejectedValue(mockTwilioErrorResponse);

      const result = await service.sendSms(mockMessage);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should include error code in result', async () => {
      mockTwilioClient.messages.create.mockRejectedValue({
        code: 21211,
        message: 'Invalid phone number',
      });

      const result = await service.sendSms(mockMessage);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(21211);
    });

    it('should handle network errors', async () => {
      mockTwilioClient.messages.create.mockRejectedValue(new Error('Network error'));

      const result = await service.sendSms(mockMessage);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  describe('phone number validation', () => {
    it('should validate E.164 format', () => {
      expect(service.isValidPhoneNumber('+1234567890')).toBe(true);
      expect(service.isValidPhoneNumber('+442071234567')).toBe(true);
      expect(service.isValidPhoneNumber('1234567890')).toBe(false);
      expect(service.isValidPhoneNumber('+1')).toBe(false);
      expect(service.isValidPhoneNumber('')).toBe(false);
    });

    it('should reject invalid phone numbers', async () => {
      const result = await service.sendSms({
        to: 'invalid',
        body: 'Test',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid phone number');
    });
  });

  describe('delivery status tracking', () => {
    it('should return initial status', async () => {
      mockTwilioClient.messages.create.mockResolvedValue(mockTwilioSuccessResponse);

      const result = await service.sendSms({ to: '+1234567890', body: 'Test' });

      expect(result.status).toBe('queued');
    });

    it('should identify delivery failure statuses', () => {
      expect(service.isDeliveryFailure('failed')).toBe(true);
      expect(service.isDeliveryFailure('undelivered')).toBe(true);
      expect(service.isDeliveryFailure('delivered')).toBe(false);
      expect(service.isDeliveryFailure('queued')).toBe(false);
    });
  });

  describe('retry logic', () => {
    const mockMessage: SmsMessage = {
      to: '+1234567890',
      body: 'Test message',
    };

    it('should retry on transient failures', async () => {
      mockTwilioClient.messages.create
        .mockRejectedValueOnce({ code: 20429, message: 'Too many requests' })
        .mockResolvedValueOnce(mockTwilioSuccessResponse);

      const result = await service.sendSmsWithRetry(mockMessage, { maxRetries: 2 });

      expect(result.success).toBe(true);
      expect(mockTwilioClient.messages.create).toHaveBeenCalledTimes(2);
    });

    it('should not retry on permanent failures', async () => {
      mockTwilioClient.messages.create.mockRejectedValue({
        code: 21211,
        message: 'Invalid phone number',
      });

      const result = await service.sendSmsWithRetry(mockMessage, { maxRetries: 3 });

      expect(result.success).toBe(false);
      expect(mockTwilioClient.messages.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('batch sending', () => {
    it('should send multiple SMS messages', async () => {
      mockTwilioClient.messages.create.mockResolvedValue(mockTwilioSuccessResponse);

      const messages: SmsMessage[] = [
        { to: '+1111111111', body: 'Message 1' },
        { to: '+2222222222', body: 'Message 2' },
      ];

      const results = await service.sendBatch(messages);

      expect(results.successful).toBe(2);
      expect(results.failed).toBe(0);
    });

    it('should handle partial failures', async () => {
      mockTwilioClient.messages.create
        .mockResolvedValueOnce(mockTwilioSuccessResponse)
        .mockRejectedValueOnce({ code: 21211, message: 'Invalid number' });

      const messages: SmsMessage[] = [
        { to: '+1111111111', body: 'Message 1' },
        { to: 'invalid', body: 'Message 2' },
      ];

      const results = await service.sendBatch(messages);

      expect(results.successful).toBe(1);
      expect(results.failed).toBe(1);
    });
  });
});
