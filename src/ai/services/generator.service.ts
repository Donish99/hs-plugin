import { Injectable, Logger } from '@nestjs/common';
import { OpenAIService, TokenUsage, ChatMessage } from './openai.service';
import { ContextService, ContactContext } from './context.service';
import { PromptService, MessageTone } from './prompt.service';

export interface GeneratedMessage {
  subject: string;
  body: string;
}

export interface GenerationOptions {
  tone?: MessageTone;
  template?: 'reactivation' | 'follow-up' | 'check-in';
  forceRefreshContext?: boolean;
  maxRetries?: number;
}

export interface GenerationResult {
  message: GeneratedMessage;
  tone: MessageTone;
  usage: TokenUsage;
  context: ContactContext;
}

export interface VariantResult {
  variants: Array<{
    tone: MessageTone;
    message: GeneratedMessage;
    usage: TokenUsage;
  }>;
  errors: Array<{
    tone: MessageTone;
    error: string;
  }>;
  totalUsage: TokenUsage;
  context: ContactContext;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface BatchResult {
  successful: Array<{
    contactId: string;
    result: GenerationResult;
  }>;
  failed: Array<{
    contactId: string;
    error: string;
  }>;
  totalUsage: TokenUsage;
}

// GPT-4o pricing (approximate, per 1M tokens)
const PRICING = {
  input: 2.5, // $2.50 per 1M input tokens
  output: 10.0, // $10 per 1M output tokens
};

/**
 * Service for generating personalized reactivation messages using AI
 */
@Injectable()
export class GeneratorService {
  private readonly logger = new Logger(GeneratorService.name);
  private readonly maxSubjectLength = 60;
  private readonly defaultMaxRetries = 3;

  constructor(
    private readonly openaiService: OpenAIService,
    private readonly contextService: ContextService,
    private readonly promptService: PromptService,
  ) {}

  /**
   * Generate a personalized message for a contact
   */
  async generateMessage(
    accountId: string,
    portalId: number,
    contactId: string,
    options: GenerationOptions = {},
  ): Promise<GenerationResult> {
    const tone = options.tone || 'professional';

    // Get contact context
    const context = await this.contextService.getContactContext(
      accountId,
      portalId,
      contactId,
      options.forceRefreshContext,
    );

    // Build prompts
    const systemPrompt = this.promptService.getSystemPrompt(options.template || 'reactivation');
    let userPrompt = this.promptService.buildPromptWithTone(context, { tone });

    // Validate and truncate if needed
    const validation = this.promptService.validatePromptLength(systemPrompt + userPrompt);
    if (!validation.valid) {
      const truncatedContext = this.promptService.truncateContext(context);
      userPrompt = this.promptService.buildPromptWithTone(truncatedContext, { tone });
    }

    // Generate message
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const response = await this.openaiService.generateJSON<GeneratedMessage>(messages);

    return {
      message: response.data,
      tone,
      usage: response.usage,
      context,
    };
  }

  /**
   * Generate multiple message variants with different tones
   */
  async generateVariants(
    accountId: string,
    portalId: number,
    contactId: string,
    count: number = 3,
  ): Promise<VariantResult> {
    // Get contact context once
    const context = await this.contextService.getContactContext(accountId, portalId, contactId);

    // Get variant prompts
    const variantPrompts = this.promptService.buildVariantPrompts(context, count);

    const variants: VariantResult['variants'] = [];
    const errors: VariantResult['errors'] = [];
    const totalUsage: TokenUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    };

    // Generate each variant
    for (const variant of variantPrompts) {
      try {
        const messages: ChatMessage[] = [
          { role: 'system', content: variant.systemPrompt },
          { role: 'user', content: variant.userPrompt },
        ];

        const response = await this.openaiService.generateJSON<GeneratedMessage>(messages);

        variants.push({
          tone: variant.tone,
          message: response.data,
          usage: response.usage,
        });

        // Accumulate usage
        totalUsage.promptTokens += response.usage.promptTokens;
        totalUsage.completionTokens += response.usage.completionTokens;
        totalUsage.totalTokens += response.usage.totalTokens;
      } catch (error) {
        this.logger.warn(`Failed to generate ${variant.tone} variant: ${error}`);
        errors.push({
          tone: variant.tone,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      variants,
      errors,
      totalUsage,
      context,
    };
  }

  /**
   * Generate with retry on validation failure
   */
  async generateWithRetry(
    accountId: string,
    portalId: number,
    contactId: string,
    options: GenerationOptions = {},
  ): Promise<GenerationResult> {
    const maxRetries = options.maxRetries || this.defaultMaxRetries;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.generateMessage(accountId, portalId, contactId, options);

        // Validate output
        const validation = this.validateOutput(result.message);
        if (validation.valid) {
          return result;
        }

        this.logger.warn(
          `Generation attempt ${attempt} produced invalid output: ${validation.errors.join(', ')}`,
        );
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.warn(`Generation attempt ${attempt} failed: ${lastError.message}`);
      }
    }

    throw new Error(`Failed to generate valid message after ${maxRetries} attempts`);
  }

  /**
   * Generate messages for multiple contacts
   */
  async generateBatch(
    accountId: string,
    portalId: number,
    contactIds: string[],
    options: GenerationOptions = {},
  ): Promise<BatchResult> {
    const successful: BatchResult['successful'] = [];
    const failed: BatchResult['failed'] = [];
    const totalUsage: TokenUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    };

    for (const contactId of contactIds) {
      try {
        const result = await this.generateMessage(accountId, portalId, contactId, options);

        successful.push({ contactId, result });

        // Accumulate usage
        totalUsage.promptTokens += result.usage.promptTokens;
        totalUsage.completionTokens += result.usage.completionTokens;
        totalUsage.totalTokens += result.usage.totalTokens;
      } catch (error) {
        this.logger.warn(`Failed to generate for contact ${contactId}: ${error}`);
        failed.push({
          contactId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      successful,
      failed,
      totalUsage,
    };
  }

  /**
   * Validate generated message output
   */
  validateOutput(message: GeneratedMessage): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check required fields
    if (!message.subject || message.subject.trim() === '') {
      errors.push('Subject is required');
    }

    if (!message.body || message.body.trim() === '') {
      errors.push('Body is required');
    }

    // Check subject length
    if (message.subject && message.subject.length > this.maxSubjectLength) {
      warnings.push('Subject exceeds recommended length');
    }

    // Check for placeholder text
    if (message.body && message.body.includes('[')) {
      warnings.push('Body may contain unresolved placeholders');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Estimate cost based on token usage
   */
  estimateCost(usage: TokenUsage): number {
    if (usage.totalTokens === 0) {
      return 0;
    }

    const inputCost = (usage.promptTokens / 1_000_000) * PRICING.input;
    const outputCost = (usage.completionTokens / 1_000_000) * PRICING.output;

    return inputCost + outputCost;
  }
}
