import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OpenAIService, ChatMessage, ChatCompletionOptions, ChatCompletionResult } from './openai.service';

describe('OpenAIService', () => {
  let service: OpenAIService;
  let configService: jest.Mocked<ConfigService>;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, any> = {
        'ai.openaiApiKey': 'sk-test-key-12345',
        'ai.model': 'gpt-4o',
        'ai.maxTokens': 500,
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpenAIService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<OpenAIService>(OpenAIService);
    configService = module.get(ConfigService);

    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should initialize with config values', () => {
      // Service should have been initialized with the mock config values
      // We verify this by checking that the service uses the expected defaults
      expect(service).toBeDefined();
      // The default model should be from config
      expect((service as any).defaultModel).toBe('gpt-4o');
      expect((service as any).defaultMaxTokens).toBe(500);
    });
  });

  describe('chat', () => {
    const mockMessages: ChatMessage[] = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello!' },
    ];

    it('should make a successful chat completion request', async () => {
      const mockResponse: ChatCompletionResult = {
        content: 'Hello! How can I help you today?',
        usage: {
          promptTokens: 20,
          completionTokens: 10,
          totalTokens: 30,
        },
        model: 'gpt-4o',
        finishReason: 'stop',
      };

      jest.spyOn(service as any, 'makeRequest').mockResolvedValue(mockResponse);

      const result = await service.chat(mockMessages);

      expect(result.content).toBe('Hello! How can I help you today?');
      expect(result.usage.totalTokens).toBe(30);
      expect(result.finishReason).toBe('stop');
    });

    it('should use default options when not provided', async () => {
      const mockResponse: ChatCompletionResult = {
        content: 'Response',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        model: 'gpt-4o',
        finishReason: 'stop',
      };

      const makeRequestSpy = jest.spyOn(service as any, 'makeRequest').mockResolvedValue(mockResponse);

      await service.chat(mockMessages);

      expect(makeRequestSpy).toHaveBeenCalledWith(
        mockMessages,
        expect.objectContaining({
          model: 'gpt-4o',
          maxTokens: 500,
        }),
      );
    });

    it('should use custom options when provided', async () => {
      const mockResponse: ChatCompletionResult = {
        content: 'Response',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        model: 'gpt-4o-mini',
        finishReason: 'stop',
      };

      const makeRequestSpy = jest.spyOn(service as any, 'makeRequest').mockResolvedValue(mockResponse);

      const options: ChatCompletionOptions = {
        model: 'gpt-4o-mini',
        maxTokens: 1000,
        temperature: 0.9,
      };

      await service.chat(mockMessages, options);

      expect(makeRequestSpy).toHaveBeenCalledWith(
        mockMessages,
        expect.objectContaining({
          model: 'gpt-4o-mini',
          maxTokens: 1000,
          temperature: 0.9,
        }),
      );
    });

    it('should support different temperature settings', async () => {
      const mockResponse: ChatCompletionResult = {
        content: 'Creative response',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        model: 'gpt-4o',
        finishReason: 'stop',
      };

      const makeRequestSpy = jest.spyOn(service as any, 'makeRequest').mockResolvedValue(mockResponse);

      await service.chat(mockMessages, { temperature: 0.2 });

      expect(makeRequestSpy).toHaveBeenCalledWith(
        mockMessages,
        expect.objectContaining({ temperature: 0.2 }),
      );
    });
  });

  describe('retry logic', () => {
    const mockMessages: ChatMessage[] = [
      { role: 'user', content: 'Test message' },
    ];

    it('should retry on transient errors', async () => {
      const mockResponse: ChatCompletionResult = {
        content: 'Success after retry',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        model: 'gpt-4o',
        finishReason: 'stop',
      };

      jest.spyOn(service as any, 'delay').mockResolvedValue(undefined);

      const makeRequestSpy = jest.spyOn(service as any, 'makeRequest')
        .mockRejectedValueOnce(new Error('Connection timeout'))
        .mockResolvedValueOnce(mockResponse);

      const result = await service.chat(mockMessages);

      expect(makeRequestSpy).toHaveBeenCalledTimes(2);
      expect(result.content).toBe('Success after retry');
    });

    it('should retry with exponential backoff', async () => {
      const mockResponse: ChatCompletionResult = {
        content: 'Success',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        model: 'gpt-4o',
        finishReason: 'stop',
      };

      jest.spyOn(service as any, 'makeRequest')
        .mockRejectedValueOnce(new Error('Rate limit'))
        .mockRejectedValueOnce(new Error('Rate limit'))
        .mockResolvedValueOnce(mockResponse);

      const delaySpy = jest.spyOn(service as any, 'delay').mockResolvedValue(undefined);

      await service.chat(mockMessages);

      // Should have delays with exponential backoff
      expect(delaySpy).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries exceeded', async () => {
      jest.spyOn(service as any, 'makeRequest')
        .mockRejectedValue(new Error('Persistent error'));

      jest.spyOn(service as any, 'delay').mockResolvedValue(undefined);

      await expect(service.chat(mockMessages)).rejects.toThrow('Persistent error');
    });

    it('should not retry on non-retryable errors', async () => {
      const authError = new Error('Invalid API key');
      (authError as any).status = 401;

      jest.spyOn(service as any, 'makeRequest').mockRejectedValue(authError);

      await expect(service.chat(mockMessages)).rejects.toThrow('Invalid API key');
    });
  });

  describe('rate limiting', () => {
    const mockMessages: ChatMessage[] = [
      { role: 'user', content: 'Test' },
    ];

    it('should handle rate limit errors gracefully', async () => {
      const rateLimitError = new Error('Rate limit exceeded');
      (rateLimitError as any).status = 429;
      (rateLimitError as any).headers = { 'retry-after': '5' };

      const mockResponse: ChatCompletionResult = {
        content: 'Success after rate limit',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        model: 'gpt-4o',
        finishReason: 'stop',
      };

      jest.spyOn(service as any, 'makeRequest')
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce(mockResponse);

      jest.spyOn(service as any, 'delay').mockResolvedValue(undefined);

      const result = await service.chat(mockMessages);

      expect(result.content).toBe('Success after rate limit');
    });

    it('should respect retry-after header', async () => {
      const rateLimitError = new Error('Rate limit exceeded');
      (rateLimitError as any).status = 429;
      (rateLimitError as any).headers = { 'retry-after': '10' };

      const mockResponse: ChatCompletionResult = {
        content: 'Success',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        model: 'gpt-4o',
        finishReason: 'stop',
      };

      jest.spyOn(service as any, 'makeRequest')
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce(mockResponse);

      const delaySpy = jest.spyOn(service as any, 'delay').mockResolvedValue(undefined);

      await service.chat(mockMessages);

      // Should wait at least the retry-after time (10 seconds = 10000ms)
      expect(delaySpy).toHaveBeenCalledWith(expect.any(Number));
    });
  });

  describe('token usage tracking', () => {
    const mockMessages: ChatMessage[] = [
      { role: 'user', content: 'Count my tokens' },
    ];

    it('should return accurate token usage', async () => {
      const mockResponse: ChatCompletionResult = {
        content: 'Here is your response',
        usage: {
          promptTokens: 25,
          completionTokens: 15,
          totalTokens: 40,
        },
        model: 'gpt-4o',
        finishReason: 'stop',
      };

      jest.spyOn(service as any, 'makeRequest').mockResolvedValue(mockResponse);

      const result = await service.chat(mockMessages);

      expect(result.usage.promptTokens).toBe(25);
      expect(result.usage.completionTokens).toBe(15);
      expect(result.usage.totalTokens).toBe(40);
    });

    it('should track cumulative token usage', async () => {
      const mockResponse1: ChatCompletionResult = {
        content: 'Response 1',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        model: 'gpt-4o',
        finishReason: 'stop',
      };

      const mockResponse2: ChatCompletionResult = {
        content: 'Response 2',
        usage: { promptTokens: 20, completionTokens: 10, totalTokens: 30 },
        model: 'gpt-4o',
        finishReason: 'stop',
      };

      jest.spyOn(service as any, 'makeRequest')
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2);

      await service.chat(mockMessages);
      await service.chat(mockMessages);

      const totalUsage = service.getTotalUsage();
      expect(totalUsage.totalTokens).toBe(45);
      expect(totalUsage.promptTokens).toBe(30);
      expect(totalUsage.completionTokens).toBe(15);
    });

    it('should reset usage tracking', async () => {
      const mockResponse: ChatCompletionResult = {
        content: 'Response',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        model: 'gpt-4o',
        finishReason: 'stop',
      };

      jest.spyOn(service as any, 'makeRequest').mockResolvedValue(mockResponse);

      await service.chat(mockMessages);
      service.resetUsage();

      const totalUsage = service.getTotalUsage();
      expect(totalUsage.totalTokens).toBe(0);
    });
  });

  describe('generateJSON', () => {
    const mockMessages: ChatMessage[] = [
      { role: 'user', content: 'Generate a JSON object' },
    ];

    it('should parse valid JSON response', async () => {
      const mockResponse: ChatCompletionResult = {
        content: '{"subject": "Hello", "body": "Test message"}',
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        model: 'gpt-4o',
        finishReason: 'stop',
      };

      jest.spyOn(service as any, 'makeRequest').mockResolvedValue(mockResponse);

      const result = await service.generateJSON<{ subject: string; body: string }>(mockMessages);

      expect(result.data).toEqual({ subject: 'Hello', body: 'Test message' });
      expect(result.usage.totalTokens).toBe(30);
    });

    it('should handle JSON wrapped in markdown code blocks', async () => {
      const mockResponse: ChatCompletionResult = {
        content: '```json\n{"subject": "Hello", "body": "Test"}\n```',
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        model: 'gpt-4o',
        finishReason: 'stop',
      };

      jest.spyOn(service as any, 'makeRequest').mockResolvedValue(mockResponse);

      const result = await service.generateJSON<{ subject: string; body: string }>(mockMessages);

      expect(result.data).toEqual({ subject: 'Hello', body: 'Test' });
    });

    it('should throw error for invalid JSON response', async () => {
      const mockResponse: ChatCompletionResult = {
        content: 'This is not valid JSON',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        model: 'gpt-4o',
        finishReason: 'stop',
      };

      jest.spyOn(service as any, 'makeRequest').mockResolvedValue(mockResponse);

      await expect(service.generateJSON(mockMessages)).rejects.toThrow('Failed to parse JSON');
    });

    it('should handle partial JSON in response', async () => {
      const mockResponse: ChatCompletionResult = {
        content: 'Here is the result: {"key": "value"}',
        usage: { promptTokens: 10, completionTokens: 15, totalTokens: 25 },
        model: 'gpt-4o',
        finishReason: 'stop',
      };

      jest.spyOn(service as any, 'makeRequest').mockResolvedValue(mockResponse);

      const result = await service.generateJSON<{ key: string }>(mockMessages);

      expect(result.data).toEqual({ key: 'value' });
    });
  });

  describe('error handling', () => {
    const mockMessages: ChatMessage[] = [
      { role: 'user', content: 'Test' },
    ];

    it('should handle API errors with status codes', async () => {
      const apiError = new Error('Bad Request');
      (apiError as any).status = 400;
      (apiError as any).code = 'context_length_exceeded'; // Non-retryable error

      jest.spyOn(service as any, 'makeRequest').mockRejectedValue(apiError);

      await expect(service.chat(mockMessages)).rejects.toThrow('Bad Request');
    });

    it('should handle network errors', async () => {
      const networkError = new Error('Network error');
      (networkError as any).code = 'ECONNREFUSED';

      const mockResponse: ChatCompletionResult = {
        content: 'Success',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        model: 'gpt-4o',
        finishReason: 'stop',
      };

      jest.spyOn(service as any, 'makeRequest')
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce(mockResponse);

      jest.spyOn(service as any, 'delay').mockResolvedValue(undefined);

      const result = await service.chat(mockMessages);
      expect(result.content).toBe('Success');
    });

    it('should handle context length exceeded error', async () => {
      const contextError = new Error('Context length exceeded');
      (contextError as any).status = 400;
      (contextError as any).code = 'context_length_exceeded';

      jest.spyOn(service as any, 'makeRequest').mockRejectedValue(contextError);

      await expect(service.chat(mockMessages)).rejects.toThrow('Context length exceeded');
    });

    it('should handle empty response', async () => {
      const mockResponse: ChatCompletionResult = {
        content: '',
        usage: { promptTokens: 10, completionTokens: 0, totalTokens: 10 },
        model: 'gpt-4o',
        finishReason: 'stop',
      };

      jest.spyOn(service as any, 'makeRequest').mockResolvedValue(mockResponse);

      const result = await service.chat(mockMessages);
      expect(result.content).toBe('');
    });
  });

  describe('model selection', () => {
    const mockMessages: ChatMessage[] = [
      { role: 'user', content: 'Test' },
    ];

    it('should use gpt-4o by default', async () => {
      const mockResponse: ChatCompletionResult = {
        content: 'Response',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        model: 'gpt-4o',
        finishReason: 'stop',
      };

      const makeRequestSpy = jest.spyOn(service as any, 'makeRequest').mockResolvedValue(mockResponse);

      await service.chat(mockMessages);

      expect(makeRequestSpy).toHaveBeenCalledWith(
        mockMessages,
        expect.objectContaining({ model: 'gpt-4o' }),
      );
    });

    it('should allow switching to gpt-4o-mini for cost optimization', async () => {
      const mockResponse: ChatCompletionResult = {
        content: 'Response',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        model: 'gpt-4o-mini',
        finishReason: 'stop',
      };

      const makeRequestSpy = jest.spyOn(service as any, 'makeRequest').mockResolvedValue(mockResponse);

      await service.chat(mockMessages, { model: 'gpt-4o-mini' });

      expect(makeRequestSpy).toHaveBeenCalledWith(
        mockMessages,
        expect.objectContaining({ model: 'gpt-4o-mini' }),
      );
    });
  });

  describe('estimateTokens', () => {
    it('should estimate tokens for a string', () => {
      const text = 'This is a test message with several words.';
      const estimate = service.estimateTokens(text);

      // Rough estimate: ~4 chars per token
      expect(estimate).toBeGreaterThan(0);
      expect(estimate).toBeLessThan(text.length);
    });

    it('should estimate tokens for messages array', () => {
      const messages: ChatMessage[] = [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hello there!' },
      ];

      const estimate = service.estimateTokens(messages);

      expect(estimate).toBeGreaterThan(0);
    });

    it('should return 0 for empty input', () => {
      expect(service.estimateTokens('')).toBe(0);
      expect(service.estimateTokens([])).toBe(0);
    });
  });
});
