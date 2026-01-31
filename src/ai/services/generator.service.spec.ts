import { Test, TestingModule } from '@nestjs/testing';
import { GeneratorService, GeneratedMessage, GenerationOptions, GenerationResult } from './generator.service';
import { OpenAIService, ChatCompletionResult } from './openai.service';
import { ContextService, ContactContext } from './context.service';
import { PromptService } from './prompt.service';

describe('GeneratorService', () => {
  let service: GeneratorService;
  let openaiService: jest.Mocked<OpenAIService>;
  let contextService: jest.Mocked<ContextService>;
  let promptService: jest.Mocked<PromptService>;

  const mockContext: ContactContext = {
    contactId: '12345',
    firstName: 'John',
    lastName: 'Doe',
    company: 'Acme Corp',
    jobTitle: 'VP of Sales',
    industry: 'Technology',
    lastContactDate: new Date('2024-10-15'),
    daysSinceContact: 100,
    leadScore: 85,
    dealName: 'Enterprise License',
    dealStage: 'qualifiedtobuy',
    dealAmount: 75000,
    emailHistory: [
      { subject: 'Follow up on our demo', date: new Date('2024-10-10') },
    ],
    previousInterests: ['demo', 'enterprise'],
  };

  const mockOpenAIService = {
    chat: jest.fn(),
    generateJSON: jest.fn(),
    getTotalUsage: jest.fn(),
    resetUsage: jest.fn(),
    estimateTokens: jest.fn(),
  };

  const mockContextService = {
    getContactContext: jest.fn(),
    buildContextForPrompt: jest.fn(),
    invalidateCache: jest.fn(),
  };

  const mockPromptService = {
    getSystemPrompt: jest.fn(),
    buildUserPrompt: jest.fn(),
    buildPromptWithTone: jest.fn(),
    buildVariantPrompts: jest.fn(),
    getOutputFormatInstructions: jest.fn(),
    validatePromptLength: jest.fn(),
    truncateContext: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeneratorService,
        { provide: OpenAIService, useValue: mockOpenAIService },
        { provide: ContextService, useValue: mockContextService },
        { provide: PromptService, useValue: mockPromptService },
      ],
    }).compile();

    service = module.get<GeneratorService>(GeneratorService);
    openaiService = module.get(OpenAIService);
    contextService = module.get(ContextService);
    promptService = module.get(PromptService);

    jest.clearAllMocks();

    // Set up default mocks
    mockContextService.getContactContext.mockResolvedValue(mockContext);
    mockContextService.buildContextForPrompt.mockReturnValue('Contact context string');
    mockPromptService.getSystemPrompt.mockReturnValue('System prompt');
    mockPromptService.buildUserPrompt.mockReturnValue('User prompt');
    mockPromptService.buildPromptWithTone.mockReturnValue('User prompt with tone');
    mockPromptService.validatePromptLength.mockReturnValue({ valid: true, estimatedTokens: 100, maxTokens: 8000 });
    mockPromptService.truncateContext.mockReturnValue(mockContext);
    mockOpenAIService.estimateTokens.mockReturnValue(100);
  });

  describe('generateMessage', () => {
    it('should generate a message for a contact', async () => {
      const mockResponse = {
        data: { subject: 'Re: Your project', body: 'Hi John, hope you are well...' },
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      };

      mockOpenAIService.generateJSON.mockResolvedValue(mockResponse);

      const result = await service.generateMessage('account-123', 123456, '12345');

      expect(result.message.subject).toBe('Re: Your project');
      expect(result.message.body).toContain('Hi John');
      expect(result.usage.totalTokens).toBe(150);
    });

    it('should fetch contact context before generating', async () => {
      mockOpenAIService.generateJSON.mockResolvedValue({
        data: { subject: 'Test', body: 'Test body' },
        usage: { promptTokens: 50, completionTokens: 25, totalTokens: 75 },
      });

      await service.generateMessage('account-123', 123456, '12345');

      expect(mockContextService.getContactContext).toHaveBeenCalledWith(
        'account-123',
        123456,
        '12345',
        undefined,
      );
    });

    it('should use specified tone when provided', async () => {
      mockOpenAIService.generateJSON.mockResolvedValue({
        data: { subject: 'Hey!', body: 'Just checking in...' },
        usage: { promptTokens: 50, completionTokens: 25, totalTokens: 75 },
      });

      await service.generateMessage('account-123', 123456, '12345', { tone: 'casual' });

      expect(mockPromptService.buildPromptWithTone).toHaveBeenCalledWith(
        mockContext,
        expect.objectContaining({ tone: 'casual' }),
      );
    });

    it('should handle generation errors gracefully', async () => {
      mockOpenAIService.generateJSON.mockRejectedValue(new Error('API error'));

      await expect(
        service.generateMessage('account-123', 123456, '12345'),
      ).rejects.toThrow('API error');
    });

    it('should validate prompt length before sending', async () => {
      mockPromptService.validatePromptLength.mockReturnValue({
        valid: false,
        estimatedTokens: 10000,
        maxTokens: 8000,
      });

      mockOpenAIService.generateJSON.mockResolvedValue({
        data: { subject: 'Test', body: 'Body' },
        usage: { promptTokens: 50, completionTokens: 25, totalTokens: 75 },
      });

      await service.generateMessage('account-123', 123456, '12345');

      expect(mockPromptService.truncateContext).toHaveBeenCalled();
    });
  });

  describe('generateVariants', () => {
    it('should generate multiple message variants', async () => {
      mockPromptService.buildVariantPrompts.mockReturnValue([
        { tone: 'professional', systemPrompt: 'Sys', userPrompt: 'User 1' },
        { tone: 'casual', systemPrompt: 'Sys', userPrompt: 'User 2' },
        { tone: 'curious', systemPrompt: 'Sys', userPrompt: 'User 3' },
      ]);

      mockOpenAIService.generateJSON
        .mockResolvedValueOnce({
          data: { subject: 'Professional subject', body: 'Professional body' },
          usage: { promptTokens: 50, completionTokens: 25, totalTokens: 75 },
        })
        .mockResolvedValueOnce({
          data: { subject: 'Casual subject', body: 'Casual body' },
          usage: { promptTokens: 50, completionTokens: 25, totalTokens: 75 },
        })
        .mockResolvedValueOnce({
          data: { subject: 'Curious subject', body: 'Curious body' },
          usage: { promptTokens: 50, completionTokens: 25, totalTokens: 75 },
        });

      const result = await service.generateVariants('account-123', 123456, '12345', 3);

      expect(result.variants).toHaveLength(3);
      expect(result.variants[0].tone).toBe('professional');
      expect(result.variants[1].tone).toBe('casual');
      expect(result.variants[2].tone).toBe('curious');
    });

    it('should continue generating remaining variants if one fails', async () => {
      mockPromptService.buildVariantPrompts.mockReturnValue([
        { tone: 'professional', systemPrompt: 'Sys', userPrompt: 'User 1' },
        { tone: 'casual', systemPrompt: 'Sys', userPrompt: 'User 2' },
      ]);

      mockOpenAIService.generateJSON
        .mockRejectedValueOnce(new Error('API error'))
        .mockResolvedValueOnce({
          data: { subject: 'Casual subject', body: 'Casual body' },
          usage: { promptTokens: 50, completionTokens: 25, totalTokens: 75 },
        });

      const result = await service.generateVariants('account-123', 123456, '12345', 2);

      expect(result.variants).toHaveLength(1);
      expect(result.variants[0].tone).toBe('casual');
      expect(result.errors).toHaveLength(1);
    });

    it('should track total token usage across variants', async () => {
      mockPromptService.buildVariantPrompts.mockReturnValue([
        { tone: 'professional', systemPrompt: 'Sys', userPrompt: 'User 1' },
        { tone: 'casual', systemPrompt: 'Sys', userPrompt: 'User 2' },
      ]);

      mockOpenAIService.generateJSON
        .mockResolvedValueOnce({
          data: { subject: 'Subject 1', body: 'Body 1' },
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        })
        .mockResolvedValueOnce({
          data: { subject: 'Subject 2', body: 'Body 2' },
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        });

      const result = await service.generateVariants('account-123', 123456, '12345', 2);

      expect(result.totalUsage.totalTokens).toBe(300);
    });
  });

  describe('validateOutput', () => {
    it('should validate a properly formatted email', () => {
      const message: GeneratedMessage = {
        subject: 'Valid subject',
        body: 'Valid body with enough content.',
      };

      const result = service.validateOutput(message);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject empty subject', () => {
      const message: GeneratedMessage = {
        subject: '',
        body: 'Valid body',
      };

      const result = service.validateOutput(message);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Subject is required');
    });

    it('should reject empty body', () => {
      const message: GeneratedMessage = {
        subject: 'Valid subject',
        body: '',
      };

      const result = service.validateOutput(message);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Body is required');
    });

    it('should warn about long subject lines', () => {
      const message: GeneratedMessage = {
        subject: 'This is an extremely long subject line that exceeds the recommended character limit for email subjects',
        body: 'Valid body',
      };

      const result = service.validateOutput(message);

      expect(result.warnings).toContain('Subject exceeds recommended length');
    });
  });

  describe('generateWithRetry', () => {
    it('should retry on validation failure', async () => {
      const invalidResponse = {
        data: { subject: '', body: 'Body only' },
        usage: { promptTokens: 50, completionTokens: 25, totalTokens: 75 },
      };

      const validResponse = {
        data: { subject: 'Valid subject', body: 'Valid body' },
        usage: { promptTokens: 50, completionTokens: 25, totalTokens: 75 },
      };

      mockOpenAIService.generateJSON
        .mockResolvedValueOnce(invalidResponse)
        .mockResolvedValueOnce(validResponse);

      const result = await service.generateWithRetry('account-123', 123456, '12345');

      expect(mockOpenAIService.generateJSON).toHaveBeenCalledTimes(2);
      expect(result.message.subject).toBe('Valid subject');
    });

    it('should throw after max retries', async () => {
      const invalidResponse = {
        data: { subject: '', body: '' },
        usage: { promptTokens: 50, completionTokens: 25, totalTokens: 75 },
      };

      mockOpenAIService.generateJSON.mockResolvedValue(invalidResponse);

      await expect(
        service.generateWithRetry('account-123', 123456, '12345', { maxRetries: 2 }),
      ).rejects.toThrow('Failed to generate valid message after 2 attempts');
    });
  });

  describe('generateBatch', () => {
    it('should generate messages for multiple contacts', async () => {
      mockOpenAIService.generateJSON.mockResolvedValue({
        data: { subject: 'Test subject', body: 'Test body' },
        usage: { promptTokens: 50, completionTokens: 25, totalTokens: 75 },
      });

      const contactIds = ['12345', '12346', '12347'];
      const results = await service.generateBatch('account-123', 123456, contactIds);

      expect(results.successful).toHaveLength(3);
      expect(results.failed).toHaveLength(0);
    });

    it('should handle partial failures in batch', async () => {
      mockContextService.getContactContext
        .mockResolvedValueOnce(mockContext)
        .mockRejectedValueOnce(new Error('Contact not found'))
        .mockResolvedValueOnce(mockContext);

      mockOpenAIService.generateJSON.mockResolvedValue({
        data: { subject: 'Test subject', body: 'Test body' },
        usage: { promptTokens: 50, completionTokens: 25, totalTokens: 75 },
      });

      const contactIds = ['12345', '12346', '12347'];
      const results = await service.generateBatch('account-123', 123456, contactIds);

      expect(results.successful).toHaveLength(2);
      expect(results.failed).toHaveLength(1);
      expect(results.failed[0].contactId).toBe('12346');
    });

    it('should track total usage across batch', async () => {
      mockOpenAIService.generateJSON.mockResolvedValue({
        data: { subject: 'Test', body: 'Body' },
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      });

      const contactIds = ['12345', '12346'];
      const results = await service.generateBatch('account-123', 123456, contactIds);

      expect(results.totalUsage.totalTokens).toBe(300);
    });
  });

  describe('estimateCost', () => {
    it('should estimate cost for message generation', () => {
      const usage = { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 };
      const cost = service.estimateCost(usage);

      expect(cost).toBeGreaterThan(0);
      expect(typeof cost).toBe('number');
    });

    it('should return 0 for no usage', () => {
      const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
      const cost = service.estimateCost(usage);

      expect(cost).toBe(0);
    });
  });
});
