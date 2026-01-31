import { Test, TestingModule } from '@nestjs/testing';
import { ReviewController } from './review.controller';
import { ReviewService, ReviewStats } from '../services/review.service';
import { ReviewQueue, ReviewStatus } from '../../entities/review-queue.entity';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('ReviewController', () => {
  let controller: ReviewController;
  let reviewService: jest.Mocked<ReviewService>;

  const mockAccountId = 'account-123';
  const mockReviewId = 'review-uuid-123';

  const mockReviewItem: Partial<ReviewQueue> = {
    id: mockReviewId,
    accountId: mockAccountId,
    variantId: 'variant-uuid-123',
    hubspotContactId: 12345,
    contactName: 'John Doe',
    contactEmail: 'john@example.com',
    companyName: 'Acme Corp',
    originalSubject: 'Quick check-in',
    originalBody: 'Hi John, hope you are doing well...',
    status: ReviewStatus.PENDING,
    autoApproved: false,
    priority: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockReviewService = {
    queueForReview: jest.fn(),
    getPendingReviews: jest.fn(),
    getReviewById: jest.fn(),
    approveReview: jest.fn(),
    rejectReview: jest.fn(),
    editAndApprove: jest.fn(),
    bulkApprove: jest.fn(),
    bulkReject: jest.fn(),
    getReviewStats: jest.fn(),
    autoApproveByRules: jest.fn(),
    requestRegeneration: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReviewController],
      providers: [{ provide: ReviewService, useValue: mockReviewService }],
    }).compile();

    controller = module.get<ReviewController>(ReviewController);
    reviewService = module.get(ReviewService);

    jest.clearAllMocks();
  });

  describe('getPendingReviews', () => {
    it('should return pending reviews', async () => {
      mockReviewService.getPendingReviews.mockResolvedValue([mockReviewItem]);

      const result = await controller.getPendingReviews(mockAccountId, {});

      expect(result.reviews).toHaveLength(1);
      expect(result.count).toBe(1);
    });

    it('should support limit parameter', async () => {
      mockReviewService.getPendingReviews.mockResolvedValue([mockReviewItem]);

      await controller.getPendingReviews(mockAccountId, { limit: 10 });

      expect(mockReviewService.getPendingReviews).toHaveBeenCalledWith(mockAccountId, {
        limit: 10,
      });
    });
  });

  describe('getReview', () => {
    it('should return a review by ID', async () => {
      mockReviewService.getReviewById.mockResolvedValue(mockReviewItem as ReviewQueue);

      const result = await controller.getReview(mockAccountId, mockReviewId);

      expect(result.id).toBe(mockReviewId);
    });

    it('should throw NotFoundException when review not found', async () => {
      mockReviewService.getReviewById.mockResolvedValue(null);

      await expect(controller.getReview(mockAccountId, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('approveReview', () => {
    it('should approve a review', async () => {
      mockReviewService.approveReview.mockResolvedValue({
        ...mockReviewItem,
        status: ReviewStatus.APPROVED,
      } as ReviewQueue);

      const result = await controller.approveReview(mockAccountId, mockReviewId, {
        reviewedBy: 'user@example.com',
      });

      expect(result.status).toBe(ReviewStatus.APPROVED);
    });

    it('should throw BadRequestException for missing reviewedBy', async () => {
      await expect(
        controller.approveReview(mockAccountId, mockReviewId, { reviewedBy: '' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('rejectReview', () => {
    it('should reject a review', async () => {
      mockReviewService.rejectReview.mockResolvedValue({
        ...mockReviewItem,
        status: ReviewStatus.REJECTED,
        rejectionReason: 'Too salesy',
      } as ReviewQueue);

      const result = await controller.rejectReview(mockAccountId, mockReviewId, {
        reviewedBy: 'user@example.com',
        reason: 'Too salesy',
      });

      expect(result.status).toBe(ReviewStatus.REJECTED);
    });
  });

  describe('editAndApprove', () => {
    it('should edit and approve a review', async () => {
      mockReviewService.editAndApprove.mockResolvedValue({
        ...mockReviewItem,
        status: ReviewStatus.EDITED,
        editedSubject: 'New subject',
        editedBody: 'New body',
      } as ReviewQueue);

      const result = await controller.editAndApprove(mockAccountId, mockReviewId, {
        reviewedBy: 'user@example.com',
        subject: 'New subject',
        body: 'New body',
      });

      expect(result.status).toBe(ReviewStatus.EDITED);
      expect(result.editedSubject).toBe('New subject');
    });

    it('should throw BadRequestException for missing subject or body', async () => {
      await expect(
        controller.editAndApprove(mockAccountId, mockReviewId, {
          reviewedBy: 'user@example.com',
          subject: '',
          body: 'Body content',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('bulkApprove', () => {
    it('should approve multiple reviews', async () => {
      mockReviewService.bulkApprove.mockResolvedValue({
        approved: 3,
        failed: 0,
        errors: [],
      });

      const result = await controller.bulkApprove(mockAccountId, {
        reviewIds: ['r1', 'r2', 'r3'],
        reviewedBy: 'user@example.com',
      });

      expect(result.approved).toBe(3);
      expect(result.failed).toBe(0);
    });

    it('should throw BadRequestException for empty reviewIds', async () => {
      await expect(
        controller.bulkApprove(mockAccountId, {
          reviewIds: [],
          reviewedBy: 'user@example.com',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('bulkReject', () => {
    it('should reject multiple reviews', async () => {
      mockReviewService.bulkReject.mockResolvedValue({
        rejected: 2,
        failed: 0,
        errors: [],
      });

      const result = await controller.bulkReject(mockAccountId, {
        reviewIds: ['r1', 'r2'],
        reviewedBy: 'user@example.com',
        reason: 'Not relevant',
      });

      expect(result.rejected).toBe(2);
    });
  });

  describe('getStats', () => {
    it('should return review statistics', async () => {
      const mockStats: ReviewStats = {
        pending: 10,
        approved: 50,
        rejected: 5,
        edited: 15,
        total: 80,
      };
      mockReviewService.getReviewStats.mockResolvedValue(mockStats);

      const result = await controller.getStats(mockAccountId);

      expect(result.pending).toBe(10);
      expect(result.total).toBe(80);
    });
  });

  describe('autoApprove', () => {
    it('should auto-approve by rules', async () => {
      mockReviewService.autoApproveByRules.mockResolvedValue({
        autoApproved: 5,
        remaining: 10,
      });

      const result = await controller.autoApprove(mockAccountId, {
        trustedCompanies: ['Acme Corp'],
      });

      expect(result.autoApproved).toBe(5);
      expect(result.remaining).toBe(10);
    });
  });

  describe('requestRegeneration', () => {
    it('should request regeneration', async () => {
      mockReviewService.requestRegeneration.mockResolvedValue({
        deleted: true,
        variantId: 'variant-123',
      });

      const result = await controller.requestRegeneration(mockAccountId, mockReviewId);

      expect(result.success).toBe(true);
      expect(result.variantId).toBe('variant-123');
    });
  });

  describe('queueForReview', () => {
    it('should queue a message for review', async () => {
      mockReviewService.queueForReview.mockResolvedValue(mockReviewItem as ReviewQueue);

      const result = await controller.queueForReview(mockAccountId, {
        variantId: 'variant-123',
        contactName: 'John Doe',
      });

      expect(result.id).toBe(mockReviewId);
    });

    it('should throw BadRequestException for missing variantId', async () => {
      await expect(controller.queueForReview(mockAccountId, { variantId: '' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
