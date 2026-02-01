import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatCompletionResult {
  content: string;
  usage: TokenUsage;
  model: string;
  finishReason: string;
}

export interface JSONResult<T> {
  data: T;
  usage: TokenUsage;
}

/**
 * OpenAI service wrapper with retry logic, rate limiting, and token tracking
 */
@Injectable()
export class OpenAIService {
  private readonly logger = new Logger(OpenAIService.name);
  private readonly client: OpenAI;
  private readonly defaultModel: string;
  private readonly defaultMaxTokens: number;
  private readonly maxRetries = 3;
  private readonly baseDelay = 1000; // 1 second

  private totalUsage: TokenUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('ai.openaiApiKey');
    this.defaultModel = this.configService.get<string>('ai.model') || 'gpt-4o';
    this.defaultMaxTokens = this.configService.get<number>('ai.maxTokens') || 500;

    this.client = new OpenAI({ apiKey });
  }

  /**
   * Make a chat completion request with retry logic
   */
  async chat(
    messages: ChatMessage[],
    options: ChatCompletionOptions = {},
  ): Promise<ChatCompletionResult> {
    const mergedOptions: ChatCompletionOptions = {
      model: options.model || this.defaultModel,
      maxTokens: options.maxTokens || this.defaultMaxTokens,
      temperature: options.temperature,
      topP: options.topP,
      frequencyPenalty: options.frequencyPenalty,
      presencePenalty: options.presencePenalty,
    };

    let lastError: Error | null = null;
    let attempt = 0;

    while (attempt < this.maxRetries) {
      try {
        const result = await this.makeRequest(messages, mergedOptions);

        // Track usage
        this.totalUsage.promptTokens += result.usage.promptTokens;
        this.totalUsage.completionTokens += result.usage.completionTokens;
        this.totalUsage.totalTokens += result.usage.totalTokens;

        return result;
      } catch (error: any) {
        lastError = error;
        attempt++;

        // Don't retry on non-retryable errors
        if (!this.isRetryableError(error)) {
          throw error;
        }

        if (attempt < this.maxRetries) {
          const delayTime = this.calculateDelay(error, attempt);
          this.logger.warn(
            `OpenAI request failed (attempt ${attempt}/${this.maxRetries}), retrying in ${delayTime}ms: ${error.message}`,
          );
          await this.delay(delayTime);
        }
      }
    }

    throw lastError;
  }

  /**
   * Generate a JSON response and parse it
   */
  async generateJSON<T>(
    messages: ChatMessage[],
    options: ChatCompletionOptions = {},
  ): Promise<JSONResult<T>> {
    const result = await this.chat(messages, options);

    try {
      const data = this.parseJSON<T>(result.content);
      return {
        data,
        usage: result.usage,
      };
    } catch (error) {
      throw new Error(`Failed to parse JSON response: ${error}`);
    }
  }

  /**
   * Generate JSON response from a prompt string with optional system prompt
   * Convenience method for simple classification/extraction tasks
   */
  async generateJson<T>(
    prompt: string,
    options: { systemPrompt?: string; temperature?: number; maxTokens?: number } = {},
  ): Promise<T> {
    const messages: ChatMessage[] = [];

    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }

    messages.push({ role: 'user', content: prompt });

    const result = await this.chat(messages, {
      temperature: options.temperature ?? 0.3,
      maxTokens: options.maxTokens ?? 500,
    });

    return this.parseJSON<T>(result.content);
  }

  /**
   * Get total token usage since last reset
   */
  getTotalUsage(): TokenUsage {
    return { ...this.totalUsage };
  }

  /**
   * Reset token usage tracking
   */
  resetUsage(): void {
    this.totalUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    };
  }

  /**
   * Estimate token count for input
   * Uses rough approximation: ~4 characters per token for English text
   */
  estimateTokens(input: string | ChatMessage[]): number {
    let text: string;

    if (Array.isArray(input)) {
      if (input.length === 0) return 0;
      text = input.map((m) => m.content).join(' ');
    } else {
      text = input;
    }

    if (!text) return 0;

    // Rough estimate: ~4 characters per token
    // Add overhead for message formatting (~4 tokens per message)
    const charEstimate = Math.ceil(text.length / 4);
    const messageOverhead = Array.isArray(input) ? input.length * 4 : 0;

    return charEstimate + messageOverhead;
  }

  /**
   * Make the actual API request
   */
  private async makeRequest(
    messages: ChatMessage[],
    options: ChatCompletionOptions,
  ): Promise<ChatCompletionResult> {
    const response = await this.client.chat.completions.create({
      model: options.model!,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      top_p: options.topP,
      frequency_penalty: options.frequencyPenalty,
      presence_penalty: options.presencePenalty,
    });

    const choice = response.choices[0];
    const content = choice?.message?.content || '';

    return {
      content,
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      },
      model: response.model,
      finishReason: choice?.finish_reason || 'unknown',
    };
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: any): boolean {
    // Don't retry authentication or validation errors
    if (error.status === 401 || error.status === 403) {
      return false;
    }
    if (error.status === 400 && error.code === 'context_length_exceeded') {
      return false;
    }

    // Retry rate limits, server errors, and network errors
    if (error.status === 429) return true;
    if (error.status >= 500) return true;
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') return true;
    if (error.message?.includes('timeout') || error.message?.includes('Connection')) {
      return true;
    }

    return true; // Default to retry for unknown errors
  }

  /**
   * Calculate delay for retry with exponential backoff
   */
  private calculateDelay(error: any, attempt: number): number {
    // Check for retry-after header
    if (error.headers?.['retry-after']) {
      const retryAfter = parseInt(error.headers['retry-after'], 10);
      if (!isNaN(retryAfter)) {
        return retryAfter * 1000;
      }
    }

    // Exponential backoff: baseDelay * 2^(attempt-1)
    return this.baseDelay * Math.pow(2, attempt - 1);
  }

  /**
   * Delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Parse JSON from response, handling common formatting issues
   */
  private parseJSON<T>(content: string): T {
    // Try direct parse first
    try {
      return JSON.parse(content);
    } catch {
      // Continue to try other methods
    }

    // Try to extract JSON from markdown code blocks
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      try {
        return JSON.parse(codeBlockMatch[1].trim());
      } catch {
        // Continue to try other methods
      }
    }

    // Try to find JSON object or array in the content
    const jsonMatch = content.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        // Fall through to error
      }
    }

    throw new Error('Failed to parse JSON from response');
  }
}
