import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmailService, EmailMessage, EmailResult, EmailOptions } from './email.service';
import {
  createMockSendGridClient,
  mockSendGridSuccessResponse,
  mockSendGridErrorResponse,
} from '../../test/mocks/sendgrid.mock';

describe('EmailService', () => {
  let service: EmailService;
  let mockSendGridClient: ReturnType<typeof createMockSendGridClient>;
  let configService: jest.Mocked<ConfigService>;

  const mockConfig = {
    sendgridApiKey: 'SG.test-api-key',
    senderEmail: 'noreply@example.com',
    senderName: 'Test App',
  };

  beforeEach(async () => {
    mockSendGridClient = createMockSendGridClient();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const configMap: Record<string, any> = {
                'sendgrid.apiKey': mockConfig.sendgridApiKey,
                'sendgrid.senderEmail': mockConfig.senderEmail,
                'sendgrid.senderName': mockConfig.senderName,
              };
              return configMap[key];
            }),
          },
        },
        {
          provide: 'SENDGRID_CLIENT',
          useValue: mockSendGridClient,
        },
      ],
    }).compile();

    service = module.get<EmailService>(EmailService);
    configService = module.get(ConfigService);
  });

  describe('sendEmail', () => {
    const mockMessage: EmailMessage = {
      to: 'recipient@example.com',
      subject: 'Test Subject',
      body: '<p>Test body content</p>',
      textBody: 'Test body content',
    };

    it('should send email successfully', async () => {
      mockSendGridClient.send.mockResolvedValue(mockSendGridSuccessResponse);

      const result = await service.sendEmail(mockMessage);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('mock-message-id-12345');
      expect(mockSendGridClient.send).toHaveBeenCalledTimes(1);
    });

    it('should use configured sender details', async () => {
      mockSendGridClient.send.mockResolvedValue(mockSendGridSuccessResponse);

      await service.sendEmail(mockMessage);

      expect(mockSendGridClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          from: expect.objectContaining({
            email: mockConfig.senderEmail,
            name: mockConfig.senderName,
          }),
        }),
      );
    });

    it('should include tracking settings', async () => {
      mockSendGridClient.send.mockResolvedValue(mockSendGridSuccessResponse);

      await service.sendEmail(mockMessage);

      expect(mockSendGridClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          trackingSettings: expect.objectContaining({
            clickTracking: { enable: true },
            openTracking: { enable: true },
          }),
        }),
      );
    });

    it('should handle custom sender when provided', async () => {
      mockSendGridClient.send.mockResolvedValue(mockSendGridSuccessResponse);

      const options: EmailOptions = {
        fromEmail: 'custom@example.com',
        fromName: 'Custom Sender',
      };

      await service.sendEmail(mockMessage, options);

      expect(mockSendGridClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          from: { email: 'custom@example.com', name: 'Custom Sender' },
        }),
      );
    });

    it('should include reply-to when provided', async () => {
      mockSendGridClient.send.mockResolvedValue(mockSendGridSuccessResponse);

      const options: EmailOptions = {
        replyTo: 'reply@example.com',
      };

      await service.sendEmail(mockMessage, options);

      expect(mockSendGridClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          replyTo: 'reply@example.com',
        }),
      );
    });

    it('should include custom headers when provided', async () => {
      mockSendGridClient.send.mockResolvedValue(mockSendGridSuccessResponse);

      const options: EmailOptions = {
        customHeaders: {
          'X-Campaign-Id': 'campaign-123',
          'X-Contact-Id': 'contact-456',
        },
      };

      await service.sendEmail(mockMessage, options);

      expect(mockSendGridClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Campaign-Id': 'campaign-123',
            'X-Contact-Id': 'contact-456',
          }),
        }),
      );
    });
  });

  describe('error handling', () => {
    const mockMessage: EmailMessage = {
      to: 'recipient@example.com',
      subject: 'Test Subject',
      body: '<p>Test body</p>',
    };

    it('should handle SendGrid API errors', async () => {
      mockSendGridClient.send.mockRejectedValue(mockSendGridErrorResponse);

      const result = await service.sendEmail(mockMessage);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should include error details in result', async () => {
      mockSendGridClient.send.mockRejectedValue(mockSendGridErrorResponse);

      const result = await service.sendEmail(mockMessage);

      expect(result.error).toContain('verified Sender Identity');
    });

    it('should handle network errors', async () => {
      mockSendGridClient.send.mockRejectedValue(new Error('Network error'));

      const result = await service.sendEmail(mockMessage);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('should handle rate limit errors', async () => {
      const rateLimitError = {
        code: 429,
        message: 'Too many requests',
        response: {
          headers: { 'retry-after': '60' },
          body: { errors: [{ message: 'Rate limit exceeded' }] },
        },
      };
      mockSendGridClient.send.mockRejectedValue(rateLimitError);

      const result = await service.sendEmail(mockMessage);

      expect(result.success).toBe(false);
      expect(result.retryAfter).toBeDefined();
    });
  });

  describe('retry logic', () => {
    const mockMessage: EmailMessage = {
      to: 'recipient@example.com',
      subject: 'Test Subject',
      body: '<p>Test body</p>',
    };

    it('should retry on transient failures', async () => {
      mockSendGridClient.send
        .mockRejectedValueOnce({ code: 500, message: 'Server error' })
        .mockResolvedValueOnce(mockSendGridSuccessResponse);

      const result = await service.sendEmailWithRetry(mockMessage, { maxRetries: 2 });

      expect(result.success).toBe(true);
      expect(mockSendGridClient.send).toHaveBeenCalledTimes(2);
    });

    it('should not retry on permanent failures', async () => {
      mockSendGridClient.send.mockRejectedValue({
        code: 400,
        message: 'Invalid email address',
      });

      const result = await service.sendEmailWithRetry(mockMessage, { maxRetries: 3 });

      expect(result.success).toBe(false);
      expect(mockSendGridClient.send).toHaveBeenCalledTimes(1);
    });

    it('should respect max retry limit', async () => {
      mockSendGridClient.send.mockRejectedValue({ code: 500, message: 'Server error' });

      const result = await service.sendEmailWithRetry(mockMessage, { maxRetries: 3 });

      expect(result.success).toBe(false);
      expect(mockSendGridClient.send).toHaveBeenCalledTimes(3);
    });

    it('should use exponential backoff', async () => {
      const startTime = Date.now();
      mockSendGridClient.send.mockRejectedValue({ code: 500, message: 'Server error' });

      await service.sendEmailWithRetry(mockMessage, {
        maxRetries: 2,
        baseDelayMs: 50,
      });

      const elapsed = Date.now() - startTime;
      // Should wait at least baseDelay (50ms) between retries
      expect(elapsed).toBeGreaterThanOrEqual(50);
    });
  });

  describe('bounce handling', () => {
    it('should identify bounce error codes', () => {
      expect(service.isBounceError({ code: 550 })).toBe(true);
      expect(service.isBounceError({ code: 551 })).toBe(true);
      expect(service.isBounceError({ code: 552 })).toBe(true);
      expect(service.isBounceError({ code: 500 })).toBe(false);
    });

    it('should identify invalid email errors', () => {
      const error = {
        code: 400,
        response: {
          body: {
            errors: [{ field: 'personalizations.0.to.0.email', message: 'Invalid' }],
          },
        },
      };
      expect(service.isInvalidEmailError(error)).toBe(true);
    });
  });

  describe('validation', () => {
    it('should validate email format', () => {
      expect(service.isValidEmail('test@example.com')).toBe(true);
      expect(service.isValidEmail('invalid-email')).toBe(false);
      expect(service.isValidEmail('')).toBe(false);
      expect(service.isValidEmail('test@')).toBe(false);
    });

    it('should reject invalid recipient', async () => {
      const invalidMessage: EmailMessage = {
        to: 'not-an-email',
        subject: 'Test',
        body: 'Test',
      };

      const result = await service.sendEmail(invalidMessage);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid email');
    });

    it('should reject empty subject', async () => {
      const invalidMessage: EmailMessage = {
        to: 'test@example.com',
        subject: '',
        body: 'Test',
      };

      const result = await service.sendEmail(invalidMessage);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Subject is required');
    });

    it('should reject empty body', async () => {
      const invalidMessage: EmailMessage = {
        to: 'test@example.com',
        subject: 'Test',
        body: '',
      };

      const result = await service.sendEmail(invalidMessage);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Body is required');
    });
  });

  describe('template support', () => {
    it('should send with template ID', async () => {
      mockSendGridClient.send.mockResolvedValue(mockSendGridSuccessResponse);

      const options: EmailOptions = {
        templateId: 'd-abc123',
        templateData: { name: 'John', company: 'Acme Corp' },
      };

      const result = await service.sendEmail(
        { to: 'test@example.com', subject: '', body: '' },
        options,
      );

      expect(result.success).toBe(true);
      expect(mockSendGridClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          templateId: 'd-abc123',
          dynamicTemplateData: { name: 'John', company: 'Acme Corp' },
        }),
      );
    });
  });

  describe('batch sending', () => {
    it('should send multiple emails', async () => {
      mockSendGridClient.send.mockResolvedValue(mockSendGridSuccessResponse);

      const messages: EmailMessage[] = [
        { to: 'user1@example.com', subject: 'Subject 1', body: 'Body 1' },
        { to: 'user2@example.com', subject: 'Subject 2', body: 'Body 2' },
      ];

      const results = await service.sendBatch(messages);

      expect(results.successful).toBe(2);
      expect(results.failed).toBe(0);
    });

    it('should handle partial failures in batch', async () => {
      mockSendGridClient.send
        .mockResolvedValueOnce(mockSendGridSuccessResponse)
        .mockRejectedValueOnce({ code: 400, message: 'Invalid email' });

      const messages: EmailMessage[] = [
        { to: 'user1@example.com', subject: 'Subject 1', body: 'Body 1' },
        { to: 'invalid', subject: 'Subject 2', body: 'Body 2' },
      ];

      const results = await service.sendBatch(messages);

      expect(results.successful).toBe(1);
      expect(results.failed).toBe(1);
    });

    it('should respect concurrency limit in batch', async () => {
      mockSendGridClient.send.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve(mockSendGridSuccessResponse), 10),
          ),
      );

      const messages: EmailMessage[] = Array(10)
        .fill(null)
        .map((_, i) => ({
          to: `user${i}@example.com`,
          subject: `Subject ${i}`,
          body: `Body ${i}`,
        }));

      const startTime = Date.now();
      await service.sendBatch(messages, { concurrency: 2 });
      const elapsed = Date.now() - startTime;

      // With concurrency of 2, 10 messages should take at least 50ms (5 batches * 10ms)
      expect(elapsed).toBeGreaterThanOrEqual(40);
    });
  });
});
