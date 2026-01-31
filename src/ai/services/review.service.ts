import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReviewQueue, ReviewStatus } from '../../entities/review-queue.entity';
import { VariantService } from './variant.service';

export interface QueueMessageDto {
  variantId: string;
  campaignId?: string;
  contactName?: string;
  contactEmail?: string;
  companyName?: string;
  priority?: number;
}

export interface ReviewDecision {
  reviewId: string;
  decision: 'approve' | 'reject' | 'edit';
  reviewedBy: string;
  editedSubject?: string;
  editedBody?: string;
  rejectionReason?: string;
}

export interface BulkActionResult {
  approved?: number;
  rejected?: number;
  failed: number;
  errors?: string[];
}

export interface ReviewStats {
  pending: number;
  approved: number;
  rejected: number;
  edited: number;
  total: number;
}

export interface AutoApproveRules {
  trustedCompanies?: string[];
  trustedDomains?: string[];
  maxPriority?: number;
}

export interface RegenerationResult {
  deleted: boolean;
  variantId: string;
}

/**
 * Service for managing the human review queue
 */
@Injectable()
export class ReviewService {
  private readonly logger = new Logger(ReviewService.name);

  constructor(
    @InjectRepository(ReviewQueue)
    private readonly reviewRepository: Repository<ReviewQueue>,
    private readonly variantService: VariantService,
  ) {}

  /**
   * Add a message to the review queue
   */
  async queueForReview(accountId: string, dto: QueueMessageDto): Promise<ReviewQueue> {
    const variant = await this.variantService.getVariantById(dto.variantId);

    if (!variant) {
      throw new NotFoundException('Variant not found');
    }

    const review = this.reviewRepository.create({
      accountId,
      variantId: dto.variantId,
      campaignId: dto.campaignId,
      hubspotContactId: variant.hubspotContactId,
      contactName: dto.contactName,
      contactEmail: dto.contactEmail,
      companyName: dto.companyName,
      originalSubject: variant.subject,
      originalBody: variant.body,
      status: ReviewStatus.PENDING,
      priority: dto.priority || 0,
      autoApproved: false,
    });

    const saved = await this.reviewRepository.save(review);

    this.logger.log(`Queued message for review: ${saved.id} (variant ${dto.variantId})`);

    return saved;
  }

  /**
   * Get pending reviews for an account
   */
  async getPendingReviews(
    accountId: string,
    options: { limit?: number } = {},
  ): Promise<ReviewQueue[]> {
    return this.reviewRepository.find({
      where: { accountId, status: ReviewStatus.PENDING },
      order: { priority: 'DESC', createdAt: 'ASC' },
      take: options.limit || 50,
    });
  }

  /**
   * Get a review by ID
   */
  async getReviewById(reviewId: string): Promise<ReviewQueue | null> {
    return this.reviewRepository.findOne({
      where: { id: reviewId },
    });
  }

  /**
   * Approve a review
   */
  async approveReview(reviewId: string, reviewedBy: string): Promise<ReviewQueue | null> {
    const review = await this.reviewRepository.findOne({
      where: { id: reviewId },
    });

    if (!review) {
      return null;
    }

    review.status = ReviewStatus.APPROVED;
    review.reviewedBy = reviewedBy;
    review.reviewedAt = new Date();

    const saved = await this.reviewRepository.save(review);

    // Mark the variant as selected
    await this.variantService.selectVariant(review.variantId);

    this.logger.log(`Review ${reviewId} approved by ${reviewedBy}`);

    return saved;
  }

  /**
   * Reject a review
   */
  async rejectReview(
    reviewId: string,
    reviewedBy: string,
    reason?: string,
  ): Promise<ReviewQueue | null> {
    const review = await this.reviewRepository.findOne({
      where: { id: reviewId },
    });

    if (!review) {
      return null;
    }

    review.status = ReviewStatus.REJECTED;
    review.reviewedBy = reviewedBy;
    review.reviewedAt = new Date();
    review.rejectionReason = reason;

    const saved = await this.reviewRepository.save(review);

    this.logger.log(`Review ${reviewId} rejected by ${reviewedBy}: ${reason}`);

    return saved;
  }

  /**
   * Edit and approve a review
   */
  async editAndApprove(
    reviewId: string,
    reviewedBy: string,
    editedSubject: string,
    editedBody: string,
  ): Promise<ReviewQueue | null> {
    const review = await this.reviewRepository.findOne({
      where: { id: reviewId },
    });

    if (!review) {
      return null;
    }

    review.status = ReviewStatus.EDITED;
    review.reviewedBy = reviewedBy;
    review.reviewedAt = new Date();
    review.editedSubject = editedSubject;
    review.editedBody = editedBody;

    const saved = await this.reviewRepository.save(review);

    // Mark the variant as selected
    await this.variantService.selectVariant(review.variantId);

    this.logger.log(`Review ${reviewId} edited and approved by ${reviewedBy}`);

    return saved;
  }

  /**
   * Bulk approve multiple reviews
   */
  async bulkApprove(reviewIds: string[], reviewedBy: string): Promise<BulkActionResult> {
    let approved = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const reviewId of reviewIds) {
      try {
        const result = await this.approveReview(reviewId, reviewedBy);
        if (result) {
          approved++;
        } else {
          failed++;
          errors.push(`Review ${reviewId} not found`);
        }
      } catch (error: any) {
        failed++;
        errors.push(`Review ${reviewId}: ${error.message}`);
      }
    }

    this.logger.log(`Bulk approve: ${approved} approved, ${failed} failed`);

    return { approved, failed, errors };
  }

  /**
   * Bulk reject multiple reviews
   */
  async bulkReject(
    reviewIds: string[],
    reviewedBy: string,
    reason?: string,
  ): Promise<BulkActionResult> {
    let rejected = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const reviewId of reviewIds) {
      try {
        const result = await this.rejectReview(reviewId, reviewedBy, reason);
        if (result) {
          rejected++;
        } else {
          failed++;
          errors.push(`Review ${reviewId} not found`);
        }
      } catch (error: any) {
        failed++;
        errors.push(`Review ${reviewId}: ${error.message}`);
      }
    }

    this.logger.log(`Bulk reject: ${rejected} rejected, ${failed} failed`);

    return { rejected, failed, errors };
  }

  /**
   * Get review statistics for an account
   */
  async getReviewStats(accountId: string): Promise<ReviewStats> {
    const pending = await this.reviewRepository.count({
      where: { accountId, status: ReviewStatus.PENDING },
    });

    const approved = await this.reviewRepository.count({
      where: { accountId, status: ReviewStatus.APPROVED },
    });

    const rejected = await this.reviewRepository.count({
      where: { accountId, status: ReviewStatus.REJECTED },
    });

    const edited = await this.reviewRepository.count({
      where: { accountId, status: ReviewStatus.EDITED },
    });

    return {
      pending,
      approved,
      rejected,
      edited,
      total: pending + approved + rejected + edited,
    };
  }

  /**
   * Auto-approve messages that match certain rules
   */
  async autoApproveByRules(
    accountId: string,
    rules: AutoApproveRules,
  ): Promise<{ autoApproved: number; remaining: number }> {
    const pendingReviews = await this.getPendingReviews(accountId, {
      limit: 100,
    });

    let autoApproved = 0;
    let remaining = 0;

    for (const review of pendingReviews) {
      let shouldApprove = false;

      // Check trusted companies
      if (
        rules.trustedCompanies &&
        review.companyName &&
        rules.trustedCompanies.includes(review.companyName)
      ) {
        shouldApprove = true;
      }

      // Check trusted domains
      if (rules.trustedDomains && review.contactEmail) {
        const domain = review.contactEmail.split('@')[1];
        if (domain && rules.trustedDomains.includes(domain)) {
          shouldApprove = true;
        }
      }

      // Check priority threshold
      if (rules.maxPriority !== undefined && review.priority <= rules.maxPriority) {
        shouldApprove = true;
      }

      if (shouldApprove) {
        review.status = ReviewStatus.APPROVED;
        review.autoApproved = true;
        review.reviewedAt = new Date();
        review.reviewedBy = 'auto-approve';
        await this.reviewRepository.save(review);
        await this.variantService.selectVariant(review.variantId);
        autoApproved++;
      } else {
        remaining++;
      }
    }

    this.logger.log(`Auto-approve: ${autoApproved} approved, ${remaining} remaining`);

    return { autoApproved, remaining };
  }

  /**
   * Request regeneration (remove from queue, variant will need regeneration)
   */
  async requestRegeneration(reviewId: string): Promise<RegenerationResult> {
    const review = await this.reviewRepository.findOne({
      where: { id: reviewId },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    const variantId = review.variantId;
    await this.reviewRepository.delete({ id: reviewId });

    this.logger.log(`Regeneration requested for review ${reviewId}, variant ${variantId}`);

    return {
      deleted: true,
      variantId,
    };
  }

  /**
   * Get reviews for a specific campaign
   */
  async getReviewsByCampaign(
    accountId: string,
    campaignId: string,
    options: { status?: ReviewStatus; limit?: number } = {},
  ): Promise<ReviewQueue[]> {
    const where: any = { accountId, campaignId };

    if (options.status) {
      where.status = options.status;
    }

    return this.reviewRepository.find({
      where,
      order: { priority: 'DESC', createdAt: 'ASC' },
      take: options.limit || 50,
    });
  }
}
