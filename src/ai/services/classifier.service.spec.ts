import { Test, TestingModule } from '@nestjs/testing';
import {
  ClassifierService,
  ClassificationType,
  ClassificationResult,
} from './classifier.service';
import { OpenAIService } from './openai.service';

describe('ClassifierService', () => {
  let service: ClassifierService;
  let openaiService: jest.Mocked<OpenAIService>;

  const mockOpenAIService = {
    generateCompletion: jest.fn(),
    generateJson: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClassifierService,
        { provide: OpenAIService, useValue: mockOpenAIService },
      ],
    }).compile();

    service = module.get<ClassifierService>(ClassifierService);
    openaiService = module.get(OpenAIService);

    jest.clearAllMocks();
  });

  describe('classifyResponse', () => {
    it('should classify an interested response', async () => {
      mockOpenAIService.generateJson.mockResolvedValue({
        classification: 'INTERESTED',
        confidence: 0.95,
        reason: 'User expressed interest in scheduling a call',
      });

      const result = await service.classifyResponse({
        emailContent: 'Hi, this sounds great! Can we schedule a call next week?',
        contactId: 'contact-123',
        portalId: 12345,
      });

      expect(result.classification).toBe(ClassificationType.INTERESTED);
      expect(result.confidence).toBe(0.95);
      expect(result.reason).toContain('interest');
    });

    it('should classify a "not now" response', async () => {
      mockOpenAIService.generateJson.mockResolvedValue({
        classification: 'NOT_NOW',
        confidence: 0.88,
        reason: 'User indicated timing is not right but left door open',
      });

      const result = await service.classifyResponse({
        emailContent: 'Thanks for reaching out. We are not ready yet, but please check back in Q2.',
        contactId: 'contact-123',
        portalId: 12345,
      });

      expect(result.classification).toBe(ClassificationType.NOT_NOW);
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should classify a "not interested" response', async () => {
      mockOpenAIService.generateJson.mockResolvedValue({
        classification: 'NOT_INTERESTED',
        confidence: 0.92,
        reason: 'User politely declined',
      });

      const result = await service.classifyResponse({
        emailContent: 'Thank you, but we have decided to go with another solution.',
        contactId: 'contact-123',
        portalId: 12345,
      });

      expect(result.classification).toBe(ClassificationType.NOT_INTERESTED);
    });

    it('should classify an unsubscribe request', async () => {
      mockOpenAIService.generateJson.mockResolvedValue({
        classification: 'UNSUBSCRIBE',
        confidence: 0.99,
        reason: 'Explicit request to be removed from emails',
      });

      const result = await service.classifyResponse({
        emailContent: 'Please remove me from your mailing list.',
        contactId: 'contact-123',
        portalId: 12345,
      });

      expect(result.classification).toBe(ClassificationType.UNSUBSCRIBE);
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    it('should classify an out of office response', async () => {
      mockOpenAIService.generateJson.mockResolvedValue({
        classification: 'OUT_OF_OFFICE',
        confidence: 0.97,
        reason: 'Automated out of office message',
        metadata: { returnDate: '2024-02-15' },
      });

      const result = await service.classifyResponse({
        emailContent: 'I am currently out of the office and will return on February 15th. For urgent matters, please contact...',
        contactId: 'contact-123',
        portalId: 12345,
      });

      expect(result.classification).toBe(ClassificationType.OUT_OF_OFFICE);
      expect(result.metadata?.returnDate).toBeDefined();
    });

    it('should classify a bounced email', async () => {
      mockOpenAIService.generateJson.mockResolvedValue({
        classification: 'BOUNCED',
        confidence: 0.99,
        reason: 'Delivery failure notification',
      });

      const result = await service.classifyResponse({
        emailContent: 'Delivery to the following recipient failed permanently: user@example.com',
        contactId: 'contact-123',
        portalId: 12345,
      });

      expect(result.classification).toBe(ClassificationType.BOUNCED);
    });

    it('should handle ambiguous responses', async () => {
      mockOpenAIService.generateJson.mockResolvedValue({
        classification: 'NOT_NOW',
        confidence: 0.55,
        reason: 'Response is ambiguous, defaulting to NOT_NOW',
      });

      const result = await service.classifyResponse({
        emailContent: 'Maybe later.',
        contactId: 'contact-123',
        portalId: 12345,
      });

      expect(result.confidence).toBeLessThan(0.7);
    });

    it('should handle API errors gracefully', async () => {
      mockOpenAIService.generateJson.mockRejectedValue(new Error('API error'));

      const result = await service.classifyResponse({
        emailContent: 'Test message',
        contactId: 'contact-123',
        portalId: 12345,
      });

      expect(result.classification).toBe(ClassificationType.UNKNOWN);
      expect(result.error).toBeDefined();
    });

    it('should handle invalid AI response format', async () => {
      mockOpenAIService.generateJson.mockResolvedValue({
        // Missing classification field
        confidence: 0.9,
        reason: 'Test',
      });

      const result = await service.classifyResponse({
        emailContent: 'Test message',
        contactId: 'contact-123',
        portalId: 12345,
      });

      expect(result.classification).toBe(ClassificationType.UNKNOWN);
    });
  });

  describe('buildClassificationPrompt', () => {
    it('should include email content in prompt', () => {
      const prompt = service.buildClassificationPrompt('Hello, I am interested!');

      expect(prompt).toContain('Hello, I am interested!');
      expect(prompt).toContain('INTERESTED');
      expect(prompt).toContain('NOT_NOW');
      expect(prompt).toContain('NOT_INTERESTED');
      expect(prompt).toContain('UNSUBSCRIBE');
      expect(prompt).toContain('OUT_OF_OFFICE');
      expect(prompt).toContain('BOUNCED');
    });
  });

  describe('parseClassificationResponse', () => {
    it('should parse valid classification response', () => {
      const response = {
        classification: 'INTERESTED',
        confidence: 0.9,
        reason: 'User wants to schedule a call',
      };

      const result = service.parseClassificationResponse(response);

      expect(result.classification).toBe(ClassificationType.INTERESTED);
      expect(result.confidence).toBe(0.9);
      expect(result.reason).toBe('User wants to schedule a call');
    });

    it('should handle unknown classification type', () => {
      const response = {
        classification: 'UNKNOWN_TYPE',
        confidence: 0.5,
        reason: 'Test',
      };

      const result = service.parseClassificationResponse(response);

      expect(result.classification).toBe(ClassificationType.UNKNOWN);
    });

    it('should clamp confidence to valid range', () => {
      const response = {
        classification: 'INTERESTED',
        confidence: 1.5, // Invalid, should be clamped
        reason: 'Test',
      };

      const result = service.parseClassificationResponse(response);

      expect(result.confidence).toBeLessThanOrEqual(1.0);
    });
  });

  describe('isHighConfidence', () => {
    it('should return true for high confidence results', () => {
      const result: ClassificationResult = {
        classification: ClassificationType.INTERESTED,
        confidence: 0.9,
        reason: 'High confidence',
      };

      expect(service.isHighConfidence(result)).toBe(true);
    });

    it('should return false for low confidence results', () => {
      const result: ClassificationResult = {
        classification: ClassificationType.NOT_NOW,
        confidence: 0.5,
        reason: 'Low confidence',
      };

      expect(service.isHighConfidence(result)).toBe(false);
    });

    it('should use custom threshold when provided', () => {
      const result: ClassificationResult = {
        classification: ClassificationType.INTERESTED,
        confidence: 0.75,
        reason: 'Test',
      };

      expect(service.isHighConfidence(result, 0.7)).toBe(true);
      expect(service.isHighConfidence(result, 0.8)).toBe(false);
    });
  });

  describe('requiresFollowUp', () => {
    it('should return true for NOT_NOW classification', () => {
      const result: ClassificationResult = {
        classification: ClassificationType.NOT_NOW,
        confidence: 0.9,
        reason: 'Test',
      };

      expect(service.requiresFollowUp(result)).toBe(true);
    });

    it('should return false for INTERESTED classification', () => {
      const result: ClassificationResult = {
        classification: ClassificationType.INTERESTED,
        confidence: 0.9,
        reason: 'Test',
      };

      expect(service.requiresFollowUp(result)).toBe(false);
    });

    it('should return false for UNSUBSCRIBE classification', () => {
      const result: ClassificationResult = {
        classification: ClassificationType.UNSUBSCRIBE,
        confidence: 0.9,
        reason: 'Test',
      };

      expect(service.requiresFollowUp(result)).toBe(false);
    });
  });

  describe('shouldStopCampaign', () => {
    it('should return true for UNSUBSCRIBE', () => {
      expect(
        service.shouldStopCampaign({
          classification: ClassificationType.UNSUBSCRIBE,
          confidence: 0.9,
          reason: 'Test',
        }),
      ).toBe(true);
    });

    it('should return true for NOT_INTERESTED', () => {
      expect(
        service.shouldStopCampaign({
          classification: ClassificationType.NOT_INTERESTED,
          confidence: 0.9,
          reason: 'Test',
        }),
      ).toBe(true);
    });

    it('should return true for BOUNCED', () => {
      expect(
        service.shouldStopCampaign({
          classification: ClassificationType.BOUNCED,
          confidence: 0.9,
          reason: 'Test',
        }),
      ).toBe(true);
    });

    it('should return false for INTERESTED', () => {
      expect(
        service.shouldStopCampaign({
          classification: ClassificationType.INTERESTED,
          confidence: 0.9,
          reason: 'Test',
        }),
      ).toBe(false);
    });
  });

  describe('shouldPauseCampaign', () => {
    it('should return true for INTERESTED', () => {
      expect(
        service.shouldPauseCampaign({
          classification: ClassificationType.INTERESTED,
          confidence: 0.9,
          reason: 'Test',
        }),
      ).toBe(true);
    });

    it('should return true for OUT_OF_OFFICE', () => {
      expect(
        service.shouldPauseCampaign({
          classification: ClassificationType.OUT_OF_OFFICE,
          confidence: 0.9,
          reason: 'Test',
        }),
      ).toBe(true);
    });

    it('should return false for NOT_NOW', () => {
      expect(
        service.shouldPauseCampaign({
          classification: ClassificationType.NOT_NOW,
          confidence: 0.9,
          reason: 'Test',
        }),
      ).toBe(false);
    });
  });

  describe('extractOutOfOfficeReturnDate', () => {
    it('should extract return date from OOO message', async () => {
      mockOpenAIService.generateJson.mockResolvedValue({
        returnDate: '2024-02-15',
      });

      const date = await service.extractOutOfOfficeReturnDate(
        'I will be out of the office until February 15, 2024',
      );

      expect(date).toBeDefined();
    });

    it('should return null when no date found', async () => {
      mockOpenAIService.generateJson.mockResolvedValue({
        returnDate: null,
      });

      const date = await service.extractOutOfOfficeReturnDate(
        'I am currently unavailable',
      );

      expect(date).toBeNull();
    });
  });
});
