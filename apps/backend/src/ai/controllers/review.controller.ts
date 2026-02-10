import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { AccountId } from '../../common/decorators/account.decorator';
import { ReviewService, AutoApproveRules } from '../services/review.service';
import { ReviewQueue } from '../../entities/review-queue.entity';

interface GetPendingQuery {
  limit?: number;
}

interface ApproveDto {
  reviewedBy: string;
}

interface RejectDto {
  reviewedBy: string;
  reason?: string;
}

interface EditAndApproveDto {
  reviewedBy: string;
  subject: string;
  body: string;
}

interface BulkApproveDto {
  reviewIds: string[];
  reviewedBy: string;
}

interface BulkRejectDto {
  reviewIds: string[];
  reviewedBy: string;
  reason?: string;
}

interface QueueMessageDto {
  variantId: string;
  campaignId?: string;
  contactName?: string;
  contactEmail?: string;
  companyName?: string;
  priority?: number;
}

interface AutoApproveDto {
  trustedCompanies?: string[];
  trustedDomains?: string[];
  maxPriority?: number;
}

interface ApproveAndSendDto {
  reviewedBy: string;
  portalId: number;
  editedSubject?: string;
  editedBody?: string;
}

interface BulkApproveAndSendDto {
  reviewIds: string[];
  reviewedBy: string;
  portalId: number;
}

/**
 * Controller for human review queue endpoints
 */
@Controller('api/accounts/:accountId/reviews')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  /**
   * Get pending reviews for an account
   */
  @Get()
  async getPendingReviews(
    @AccountId() accountId: string,
    @Query() query: GetPendingQuery,
  ): Promise<{ reviews: ReviewQueue[]; count: number }> {
    const reviews = await this.reviewService.getPendingReviews(accountId, {
      limit: query.limit,
    });

    return {
      reviews,
      count: reviews.length,
    };
  }

  /**
   * Get a specific review by ID
   */
  @Get(':reviewId')
  async getReview(
    @AccountId() accountId: string,
    @Param('reviewId') reviewId: string,
  ): Promise<ReviewQueue> {
    const review = await this.reviewService.getReviewById(reviewId);

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    return review;
  }

  /**
   * Get review statistics
   */
  @Get('stats/summary')
  async getStats(@AccountId() accountId: string) {
    return this.reviewService.getReviewStats(accountId);
  }

  /**
   * Queue a message for review
   */
  @Post('queue')
  async queueForReview(
    @AccountId() accountId: string,
    @Body() dto: QueueMessageDto,
  ): Promise<ReviewQueue> {
    if (!dto.variantId || dto.variantId.trim() === '') {
      throw new BadRequestException('variantId is required');
    }

    return this.reviewService.queueForReview(accountId, dto);
  }

  /**
   * Approve a review
   */
  @Post(':reviewId/approve')
  async approveReview(
    @AccountId() accountId: string,
    @Param('reviewId') reviewId: string,
    @Body() dto: ApproveDto,
  ): Promise<ReviewQueue> {
    if (!dto.reviewedBy || dto.reviewedBy.trim() === '') {
      throw new BadRequestException('reviewedBy is required');
    }

    const result = await this.reviewService.approveReview(reviewId, dto.reviewedBy);

    if (!result) {
      throw new NotFoundException('Review not found');
    }

    return result;
  }

  /**
   * Reject a review
   */
  @Post(':reviewId/reject')
  async rejectReview(
    @AccountId() accountId: string,
    @Param('reviewId') reviewId: string,
    @Body() dto: RejectDto,
  ): Promise<ReviewQueue> {
    if (!dto.reviewedBy || dto.reviewedBy.trim() === '') {
      throw new BadRequestException('reviewedBy is required');
    }

    const result = await this.reviewService.rejectReview(reviewId, dto.reviewedBy, dto.reason);

    if (!result) {
      throw new NotFoundException('Review not found');
    }

    return result;
  }

  /**
   * Edit and approve a review
   */
  @Post(':reviewId/edit')
  async editAndApprove(
    @AccountId() accountId: string,
    @Param('reviewId') reviewId: string,
    @Body() dto: EditAndApproveDto,
  ): Promise<ReviewQueue> {
    if (!dto.reviewedBy || dto.reviewedBy.trim() === '') {
      throw new BadRequestException('reviewedBy is required');
    }

    if (!dto.subject || dto.subject.trim() === '') {
      throw new BadRequestException('subject is required');
    }

    if (!dto.body || dto.body.trim() === '') {
      throw new BadRequestException('body is required');
    }

    const result = await this.reviewService.editAndApprove(
      reviewId,
      dto.reviewedBy,
      dto.subject,
      dto.body,
    );

    if (!result) {
      throw new NotFoundException('Review not found');
    }

    return result;
  }

  /**
   * Request regeneration of a message
   */
  @Post(':reviewId/regenerate')
  async requestRegeneration(
    @AccountId() accountId: string,
    @Param('reviewId') reviewId: string,
  ): Promise<{ success: boolean; variantId: string }> {
    const result = await this.reviewService.requestRegeneration(reviewId);

    return {
      success: result.deleted,
      variantId: result.variantId,
    };
  }

  /**
   * Bulk approve multiple reviews
   */
  @Post('bulk/approve')
  async bulkApprove(@AccountId() accountId: string, @Body() dto: BulkApproveDto) {
    if (!dto.reviewIds || dto.reviewIds.length === 0) {
      throw new BadRequestException('reviewIds array is required');
    }

    if (!dto.reviewedBy || dto.reviewedBy.trim() === '') {
      throw new BadRequestException('reviewedBy is required');
    }

    return this.reviewService.bulkApprove(dto.reviewIds, dto.reviewedBy);
  }

  /**
   * Bulk reject multiple reviews
   */
  @Post('bulk/reject')
  async bulkReject(@AccountId() accountId: string, @Body() dto: BulkRejectDto) {
    if (!dto.reviewIds || dto.reviewIds.length === 0) {
      throw new BadRequestException('reviewIds array is required');
    }

    if (!dto.reviewedBy || dto.reviewedBy.trim() === '') {
      throw new BadRequestException('reviewedBy is required');
    }

    return this.reviewService.bulkReject(dto.reviewIds, dto.reviewedBy, dto.reason);
  }

  /**
   * Auto-approve messages matching rules
   */
  @Post('auto-approve')
  async autoApprove(@AccountId() accountId: string, @Body() dto: AutoApproveDto) {
    const rules: AutoApproveRules = {
      trustedCompanies: dto.trustedCompanies,
      trustedDomains: dto.trustedDomains,
      maxPriority: dto.maxPriority,
    };

    return this.reviewService.autoApproveByRules(accountId, rules);
  }

  /**
   * Approve a review and immediately send the message
   * This is the primary endpoint for review-required campaign flow
   */
  @Post(':reviewId/approve-and-send')
  async approveAndSend(
    @AccountId() accountId: string,
    @Param('reviewId') reviewId: string,
    @Body() dto: ApproveAndSendDto,
  ) {
    if (!dto.reviewedBy || dto.reviewedBy.trim() === '') {
      throw new BadRequestException('reviewedBy is required');
    }

    if (!dto.portalId || typeof dto.portalId !== 'number') {
      throw new BadRequestException('portalId is required and must be a number');
    }

    const result = await this.reviewService.approveReviewAndSend(
      reviewId,
      dto.reviewedBy,
      dto.portalId,
      dto.editedSubject,
      dto.editedBody,
    );

    return {
      review: result.review,
      outreachRecordId: result.outreachRecordId,
      messageSendQueued: result.jobQueued,
    };
  }

  /**
   * Bulk approve reviews and send messages
   */
  @Post('bulk/approve-and-send')
  async bulkApproveAndSend(
    @AccountId() accountId: string,
    @Body() dto: BulkApproveAndSendDto,
  ) {
    if (!dto.reviewIds || dto.reviewIds.length === 0) {
      throw new BadRequestException('reviewIds array is required');
    }

    if (!dto.reviewedBy || dto.reviewedBy.trim() === '') {
      throw new BadRequestException('reviewedBy is required');
    }

    if (!dto.portalId || typeof dto.portalId !== 'number') {
      throw new BadRequestException('portalId is required and must be a number');
    }

    return this.reviewService.bulkApproveAndSend(
      dto.reviewIds,
      dto.reviewedBy,
      dto.portalId,
    );
  }
}
