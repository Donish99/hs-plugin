import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { MessageVariant, VariantTone } from '../../entities/message-variant.entity';

export interface StoredVariant {
  tone: VariantTone;
  subject: string;
  body: string;
  promptTokens?: number;
  completionTokens?: number;
}

export interface StoreVariantsOptions {
  aiModel?: string;
  contextSnapshot?: Record<string, any>;
}

export interface VariantGroupResult {
  variantGroupId: string;
  variants: MessageVariant[];
}

export interface VariantAnalytics {
  totalVariants: number;
  selectedCount: number;
  sentCount: number;
  toneDistribution: Record<VariantTone, number>;
  totalTokensUsed: number;
}

/**
 * Service for managing AI-generated message variants
 */
@Injectable()
export class VariantService {
  private readonly logger = new Logger(VariantService.name);

  constructor(
    @InjectRepository(MessageVariant)
    private readonly variantRepository: Repository<MessageVariant>,
  ) {}

  /**
   * Store multiple variants for a contact with a common group ID
   */
  async storeVariants(
    accountId: string,
    contactId: number,
    variants: StoredVariant[],
    options: StoreVariantsOptions = {},
  ): Promise<VariantGroupResult> {
    const variantGroupId = uuidv4();

    const entities = variants.map((variant, index) => {
      return this.variantRepository.create({
        accountId,
        hubspotContactId: contactId,
        variantGroupId,
        variantIndex: index,
        tone: variant.tone,
        subject: variant.subject,
        body: variant.body,
        aiModel: options.aiModel,
        promptTokens: variant.promptTokens,
        completionTokens: variant.completionTokens,
        contextSnapshot: options.contextSnapshot,
        isSelected: false,
        isSent: false,
      });
    });

    const savedVariants = await this.variantRepository.save(entities);

    this.logger.log(
      `Stored ${savedVariants.length} variants for contact ${contactId} in group ${variantGroupId}`,
    );

    return {
      variantGroupId,
      variants: savedVariants,
    };
  }

  /**
   * Get all variants in a group
   */
  async getVariantsByGroup(variantGroupId: string): Promise<MessageVariant[]> {
    return this.variantRepository.find({
      where: { variantGroupId },
      order: { variantIndex: 'ASC' },
    });
  }

  /**
   * Get all variants for a contact
   */
  async getVariantsByContact(accountId: string, contactId: number): Promise<MessageVariant[]> {
    return this.variantRepository.find({
      where: { accountId, hubspotContactId: contactId },
      order: { createdAt: 'DESC', variantIndex: 'ASC' },
    });
  }

  /**
   * Get a single variant by ID
   */
  async getVariantById(variantId: string): Promise<MessageVariant | null> {
    return this.variantRepository.findOne({
      where: { id: variantId },
    });
  }

  /**
   * Select a variant (for manual selection)
   * Unselects other variants in the same group
   */
  async selectVariant(variantId: string): Promise<MessageVariant | null> {
    const variant = await this.variantRepository.findOne({
      where: { id: variantId },
    });

    if (!variant) {
      return null;
    }

    // Unselect all other variants in the group
    await this.variantRepository.update(
      { variantGroupId: variant.variantGroupId },
      { isSelected: false },
    );

    // Select this variant
    variant.isSelected = true;
    const saved = await this.variantRepository.save(variant);

    this.logger.log(
      `Selected variant ${variantId} (index ${variant.variantIndex}) in group ${variant.variantGroupId}`,
    );

    return saved;
  }

  /**
   * Mark a variant as sent
   */
  async markVariantAsSent(variantId: string): Promise<MessageVariant | null> {
    const variant = await this.variantRepository.findOne({
      where: { id: variantId },
    });

    if (!variant) {
      return null;
    }

    variant.isSent = true;
    variant.isSelected = true;
    const saved = await this.variantRepository.save(variant);

    this.logger.log(`Marked variant ${variantId} as sent`);

    return saved;
  }

  /**
   * Delete all variants in a group
   */
  async deleteVariantGroup(variantGroupId: string): Promise<number> {
    const result = await this.variantRepository.delete({
      variantGroupId,
    });

    return result.affected || 0;
  }

  /**
   * Get analytics for a variant group
   */
  async getVariantAnalytics(variantGroupId: string): Promise<VariantAnalytics> {
    const variants = await this.getVariantsByGroup(variantGroupId);

    const toneDistribution: Record<VariantTone, number> = {
      professional: 0,
      casual: 0,
      curious: 0,
    };

    let selectedCount = 0;
    let sentCount = 0;
    let totalTokensUsed = 0;

    for (const variant of variants) {
      toneDistribution[variant.tone] = (toneDistribution[variant.tone] || 0) + 1;

      if (variant.isSelected) {
        selectedCount++;
      }

      if (variant.isSent) {
        sentCount++;
      }

      totalTokensUsed += variant.getTotalTokens();
    }

    return {
      totalVariants: variants.length,
      selectedCount,
      sentCount,
      toneDistribution,
      totalTokensUsed,
    };
  }

  /**
   * Get the latest variant group for a contact
   */
  async getLatestVariantGroup(
    accountId: string,
    contactId: number,
  ): Promise<VariantGroupResult | null> {
    // Get the most recent variant for this contact
    const latestVariants = await this.variantRepository.find({
      where: { accountId, hubspotContactId: contactId },
      order: { createdAt: 'DESC' },
      take: 1,
    });

    if (latestVariants.length === 0) {
      return null;
    }

    const variantGroupId = latestVariants[0].variantGroupId;
    const variants = await this.getVariantsByGroup(variantGroupId);

    return {
      variantGroupId,
      variants,
    };
  }

  /**
   * Get the selected variant from a group
   */
  async getSelectedVariant(variantGroupId: string): Promise<MessageVariant | null> {
    return this.variantRepository.findOne({
      where: { variantGroupId, isSelected: true },
    });
  }

  /**
   * Auto-select a variant (e.g., by rotation or random)
   */
  async autoSelectVariant(
    variantGroupId: string,
    strategy: 'first' | 'random' | 'rotation' = 'first',
  ): Promise<MessageVariant | null> {
    const variants = await this.getVariantsByGroup(variantGroupId);

    if (variants.length === 0) {
      return null;
    }

    let selectedVariant: MessageVariant;

    switch (strategy) {
      case 'random':
        const randomIndex = Math.floor(Math.random() * variants.length);
        selectedVariant = variants[randomIndex];
        break;
      case 'rotation':
        // Simple rotation based on sent count
        const sentCounts = await Promise.all(
          variants.map(async (v) => {
            return { variant: v, count: v.isSent ? 1 : 0 };
          }),
        );
        sentCounts.sort((a, b) => a.count - b.count);
        selectedVariant = sentCounts[0].variant;
        break;
      case 'first':
      default:
        selectedVariant = variants[0];
    }

    return this.selectVariant(selectedVariant.id);
  }
}
