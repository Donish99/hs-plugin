import { Controller, Post, Body, Param, ParseIntPipe, BadRequestException } from '@nestjs/common';
import {
  GeneratorService,
  GeneratedMessage,
  GenerationResult,
  VariantResult,
} from '../services/generator.service';
import { MessageTone } from '../services/prompt.service';

interface GenerateMessageDto {
  contactId: string;
  tone?: MessageTone;
  template?: 'reactivation' | 'follow-up' | 'check-in';
  forceRefreshContext?: boolean;
}

interface GenerateVariantsDto {
  contactId: string;
  count?: number;
}

interface GenerateBatchDto {
  contactIds: string[];
  tone?: MessageTone;
  template?: 'reactivation' | 'follow-up' | 'check-in';
}

interface ValidateMessageDto {
  subject: string;
  body: string;
}

interface EstimateCostDto {
  type: 'single' | 'batch' | 'variants';
  contactCount: number;
  variantCount?: number;
}

interface GenerationResponse extends GenerationResult {
  estimatedCost: number;
}

interface VariantsResponse extends VariantResult {
  estimatedCost: number;
}

interface BatchResponse {
  successful: Array<{
    contactId: string;
    result: GenerationResult;
  }>;
  failed: Array<{
    contactId: string;
    error: string;
  }>;
  totalUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  estimatedCost: number;
  summary: {
    total: number;
    succeeded: number;
    failed: number;
  };
}

interface PreviewResponse extends GenerationResult {
  preview: boolean;
  estimatedCost: number;
}

const MAX_BATCH_SIZE = 50;
const AVG_TOKENS_PER_MESSAGE = 150;

/**
 * Controller for AI message generation endpoints
 */
@Controller('api/accounts/:accountId/generate')
export class GenerationController {
  constructor(private readonly generatorService: GeneratorService) {}

  /**
   * Generate a single personalized message for a contact
   */
  @Post('message')
  async generateMessage(
    @Param('accountId') accountId: string,
    @Param('portalId', ParseIntPipe) portalId: number,
    @Body() dto: GenerateMessageDto,
  ): Promise<GenerationResponse> {
    if (!dto.contactId || dto.contactId.trim() === '') {
      throw new BadRequestException('contactId is required');
    }

    const result = await this.generatorService.generateMessage(accountId, portalId, dto.contactId, {
      tone: dto.tone,
      template: dto.template,
      forceRefreshContext: dto.forceRefreshContext,
    });

    const estimatedCost = this.generatorService.estimateCost(result.usage);

    return {
      ...result,
      estimatedCost,
    };
  }

  /**
   * Generate multiple message variants for A/B testing
   */
  @Post('variants')
  async generateVariants(
    @Param('accountId') accountId: string,
    @Param('portalId', ParseIntPipe) portalId: number,
    @Body() dto: GenerateVariantsDto,
  ): Promise<VariantsResponse> {
    if (!dto.contactId || dto.contactId.trim() === '') {
      throw new BadRequestException('contactId is required');
    }

    const count = dto.count || 3;
    const result = await this.generatorService.generateVariants(
      accountId,
      portalId,
      dto.contactId,
      count,
    );

    const estimatedCost = this.generatorService.estimateCost(result.totalUsage);

    return {
      ...result,
      estimatedCost,
    };
  }

  /**
   * Generate messages for multiple contacts in batch
   */
  @Post('batch')
  async generateBatch(
    @Param('accountId') accountId: string,
    @Param('portalId', ParseIntPipe) portalId: number,
    @Body() dto: GenerateBatchDto,
  ): Promise<BatchResponse> {
    if (!dto.contactIds || dto.contactIds.length === 0) {
      throw new BadRequestException('contactIds array is required and must not be empty');
    }

    // Limit batch size
    const contactIds = dto.contactIds.slice(0, MAX_BATCH_SIZE);

    const result = await this.generatorService.generateBatch(accountId, portalId, contactIds, {
      tone: dto.tone,
      template: dto.template,
    });

    const estimatedCost = this.generatorService.estimateCost(result.totalUsage);

    return {
      ...result,
      estimatedCost,
      summary: {
        total: contactIds.length,
        succeeded: result.successful.length,
        failed: result.failed.length,
      },
    };
  }

  /**
   * Preview a message without saving (for UI preview)
   */
  @Post('preview')
  async previewMessage(
    @Param('accountId') accountId: string,
    @Param('portalId', ParseIntPipe) portalId: number,
    @Body() dto: GenerateMessageDto,
  ): Promise<PreviewResponse> {
    if (!dto.contactId || dto.contactId.trim() === '') {
      throw new BadRequestException('contactId is required');
    }

    const result = await this.generatorService.generateMessage(accountId, portalId, dto.contactId, {
      tone: dto.tone,
      template: dto.template,
      forceRefreshContext: dto.forceRefreshContext,
    });

    const estimatedCost = this.generatorService.estimateCost(result.usage);

    return {
      ...result,
      preview: true,
      estimatedCost,
    };
  }

  /**
   * Validate a message (for manual editing)
   */
  @Post('validate')
  async validateMessage(
    @Body() dto: ValidateMessageDto,
  ): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
    const message: GeneratedMessage = {
      subject: dto.subject,
      body: dto.body,
    };

    return this.generatorService.validateOutput(message);
  }

  /**
   * Estimate cost for generation operations
   */
  @Post('estimate-cost')
  async estimateCost(
    @Body() dto: EstimateCostDto,
  ): Promise<{ estimatedCost: number; contactCount: number; details: string }> {
    const baseTokens = AVG_TOKENS_PER_MESSAGE;
    let totalTokens: number;
    let details: string;

    switch (dto.type) {
      case 'single':
        totalTokens = baseTokens;
        details = 'Single message generation';
        break;
      case 'batch':
        totalTokens = baseTokens * dto.contactCount;
        details = `Batch generation for ${dto.contactCount} contacts`;
        break;
      case 'variants':
        const variantCount = dto.variantCount || 3;
        totalTokens = baseTokens * variantCount * dto.contactCount;
        details = `${variantCount} variants for ${dto.contactCount} contacts`;
        break;
      default:
        totalTokens = baseTokens;
        details = 'Unknown type';
    }

    const estimatedCost = this.generatorService.estimateCost({
      promptTokens: Math.floor(totalTokens * 0.67),
      completionTokens: Math.floor(totalTokens * 0.33),
      totalTokens,
    });

    return {
      estimatedCost,
      contactCount: dto.contactCount,
      details,
    };
  }
}
