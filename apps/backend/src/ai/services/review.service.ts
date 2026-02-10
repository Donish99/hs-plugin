import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Repository } from 'typeorm';
import { Queue } from 'bull';
import { ReviewQueue, ReviewStatus } from '../../entities/review-queue.entity';
import { OutreachRecord, OutreachStatus } from '../../entities/outreach-record.entity';
import { Campaign } from '../../entities/campaign.entity';
import { VariantService } from './variant.service';
import { QUEUE_NAMES } from '../../config/redis.config';

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

export interface ApproveAndSendResult {
  review: ReviewQueue;
  outreachRecordId?: string;
  jobQueued: boolean;
}

export interface BulkApproveAndSendResult {
  approved: number;
  failed: number;
  jobsQueued: number;
  errors: string[];
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
    @InjectRepository(OutreachRecord)
    private readonly outreachRepository: Repository<OutreachRecord>,
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,
    @InjectQueue(QUEUE_NAMES.SEND_CAMPAIGN)
    private readonly sendCampaignQueue: Queue,
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

  /**
   * Approve a review and immediately queue the message for sending
   * This is the main flow for review-required campaigns
   */
  async approveReviewAndSend(
    reviewId: string,
    reviewedBy: string,
    portalId: number,
    editedSubject?: string,
    editedBody?: string,
  ): Promise<ApproveAndSendResult> {
    const review = await this.reviewRepository.findOne({
      where: { id: reviewId },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    // Check if already processed
    if (review.status !== ReviewStatus.PENDING) {
      return {
        review,
        jobQueued: false,
      };
    }

    // Determine if this is an edit or plain approval
    const isEdited = editedSubject !== undefined || editedBody !== undefined;

    if (isEdited) {
      review.status = ReviewStatus.EDITED;
      review.editedSubject = editedSubject;
      review.editedBody = editedBody;
    } else {
      review.status = ReviewStatus.APPROVED;
    }

    review.reviewedBy = reviewedBy;
    review.reviewedAt = new Date();

    await this.reviewRepository.save(review);

    // Mark the variant as selected
    await this.variantService.selectVariant(review.variantId);

    // Find the linked OutreachRecord by variantId
    const outreachRecord = await this.outreachRepository.findOne({
      where: { variantId: review.variantId },
    });

    if (!outreachRecord) {
      this.logger.warn(`No outreach record found for variant ${review.variantId}`);
      return {
        review,
        jobQueued: false,
      };
    }

    // Apply edits to the outreach record if needed
    if (isEdited) {
      if (editedSubject) {
        outreachRecord.subject = editedSubject;
      }
      if (editedBody) {
        outreachRecord.bodyText = editedBody;
        outreachRecord.bodyHtml = this.convertToHtml(editedBody);
      }
    }

    // Update outreach status to APPROVED (ready for sending)
    outreachRecord.status = OutreachStatus.APPROVED;
    await this.outreachRepository.save(outreachRecord);

    // Get campaign info for the job
    const campaign = await this.campaignRepository.findOne({
      where: { id: outreachRecord.campaignId },
    });

    if (!campaign) {
      this.logger.warn(`Campaign not found for outreach record ${outreachRecord.id}`);
      return {
        review,
        outreachRecordId: outreachRecord.id,
        jobQueued: false,
      };
    }

    // Queue the send-approved-single job
    await this.sendCampaignQueue.add(
      'send-approved-single',
      {
        type: 'send-approved-single',
        outreachRecordId: outreachRecord.id,
        campaignId: campaign.id,
        accountId: campaign.accountId,
        portalId,
      },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    );

    this.logger.log(
      `Review ${reviewId} approved and message queued for sending: outreach ${outreachRecord.id}`,
    );

    return {
      review,
      outreachRecordId: outreachRecord.id,
      jobQueued: true,
    };
  }

  /**
   * Bulk approve reviews and queue messages for sending
   */
  async bulkApproveAndSend(
    reviewIds: string[],
    reviewedBy: string,
    portalId: number,
  ): Promise<BulkApproveAndSendResult> {
    let approved = 0;
    let failed = 0;
    let jobsQueued = 0;
    const errors: string[] = [];

    for (const reviewId of reviewIds) {
      try {
        const result = await this.approveReviewAndSend(reviewId, reviewedBy, portalId);
        if (result.review.status === ReviewStatus.APPROVED || result.review.status === ReviewStatus.EDITED) {
          approved++;
          if (result.jobQueued) {
            jobsQueued++;
          }
        } else {
          failed++;
          errors.push(`Review ${reviewId} was already processed`);
        }
      } catch (error: any) {
        failed++;
        errors.push(`Review ${reviewId}: ${error.message}`);
      }
    }

    this.logger.log(
      `Bulk approve and send: ${approved} approved, ${jobsQueued} jobs queued, ${failed} failed`,
    );

    return { approved, failed, jobsQueued, errors };
  }

  /**
   * Convert plain text to HTML with basic formatting
   */
  private convertToHtml(text: string): string {
    if (!text) return '';

    // Escape HTML entities
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Convert newlines to <br> and wrap in paragraphs
    const paragraphs = html.split(/\n\n+/);
    html = paragraphs
      .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
      .join('\n');

    return html;
  }
}
