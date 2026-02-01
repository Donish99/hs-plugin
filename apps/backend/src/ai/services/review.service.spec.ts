import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReviewService, QueueMessageDto, ReviewDecision } from './review.service';
import { ReviewQueue, ReviewStatus } from '../../entities/review-queue.entity';
import { MessageVariant } from '../../entities/message-variant.entity';
import { VariantService } from './variant.service';

describe('ReviewService', () => {
  let service: ReviewService;
  let reviewRepository: jest.Mocked<Repository<ReviewQueue>>;
  let variantService: jest.Mocked<VariantService>;

  const mockAccountId = 'account-123';
  const mockContactId = 12345;
  const mockVariantId = 'variant-uuid-123';

  const mockVariant: MessageVariant = {
    id: mockVariantId,
    accountId: mockAccountId,
    hubspotContactId: mockContactId,
    variantGroupId: 'group-uuid-123',
    variantIndex: 0,
    tone: 'professional',
    subject: 'Quick check-in',
    body: 'Hi John, hope you are doing well...',
    aiModel: 'gpt-4o',
    promptTokens: 100,
    completionTokens: 50,
    isSelected: false,
    isSent: false,
    createdAt: new Date(),
    getTotalTokens: () => 150,
    wasUsed: () => false,
  };

  const mockReviewItem: ReviewQueue = {
    id: 'review-uuid-123',
    accountId: mockAccountId,
    variantId: mockVariantId,
    hubspotContactId: mockContactId,
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
    isPending: () => true,
    isApproved: () => false,
    isRejected: () => false,
    getFinalSubject: () => 'Quick check-in',
    getFinalBody: () => 'Hi John, hope you are doing well...',
    wasEdited: () => false,
  };

  const mockReviewRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockVariantService = {
    getVariantById: jest.fn(),
    selectVariant: jest.fn(),
    markVariantAsSent: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewService,
        {
          provide: getRepositoryToken(ReviewQueue),
          useValue: mockReviewRepository,
        },
        {
          provide: VariantService,
          useValue: mockVariantService,
        },
      ],
    }).compile();

    service = module.get<ReviewService>(ReviewService);
    reviewRepository = module.get(getRepositoryToken(ReviewQueue));
    variantService = module.get(VariantService);

    jest.clearAllMocks();
  });

  describe('queueForReview', () => {
    it('should add a message to the review queue', async () => {
      mockVariantService.getVariantById.mockResolvedValue(mockVariant);
      mockReviewRepository.create.mockReturnValue(mockReviewItem);
      mockReviewRepository.save.mockResolvedValue(mockReviewItem);

      const dto: QueueMessageDto = {
        variantId: mockVariantId,
        contactName: 'John Doe',
        contactEmail: 'john@example.com',
        companyName: 'Acme Corp',
      };

      const result = await service.queueForReview(mockAccountId, dto);

      expect(result).toBeDefined();
      expect(result.status).toBe(ReviewStatus.PENDING);
      expect(mockReviewRepository.save).toHaveBeenCalled();
    });

    it('should set priority when provided', async () => {
      mockVariantService.getVariantById.mockResolvedValue(mockVariant);
      mockReviewRepository.create.mockReturnValue({ ...mockReviewItem, priority: 5 });
      mockReviewRepository.save.mockResolvedValue({ ...mockReviewItem, priority: 5 });

      const dto: QueueMessageDto = {
        variantId: mockVariantId,
        priority: 5,
      };

      const result = await service.queueForReview(mockAccountId, dto);

      expect(result.priority).toBe(5);
    });

    it('should throw error if variant not found', async () => {
      mockVariantService.getVariantById.mockResolvedValue(null);

      const dto: QueueMessageDto = {
        variantId: 'nonexistent',
      };

      await expect(service.queueForReview(mockAccountId, dto)).rejects.toThrow(
        'Variant not found',
      );
    });
  });

  describe('getPendingReviews', () => {
    it('should retrieve pending reviews for an account', async () => {
      mockReviewRepository.find.mockResolvedValue([mockReviewItem]);

      const result = await service.getPendingReviews(mockAccountId);

      expect(result).toHaveLength(1);
      expect(mockReviewRepository.find).toHaveBeenCalledWith({
        where: { accountId: mockAccountId, status: ReviewStatus.PENDING },
        order: { priority: 'DESC', createdAt: 'ASC' },
        take: 50,
      });
    });

    it('should support pagination limit', async () => {
      mockReviewRepository.find.mockResolvedValue([mockReviewItem]);

      await service.getPendingReviews(mockAccountId, { limit: 10 });

      expect(mockReviewRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10 }),
      );
    });
  });

  describe('approveReview', () => {
    it('should approve a review', async () => {
      mockReviewRepository.findOne.mockResolvedValue({ ...mockReviewItem });
      mockReviewRepository.save.mockImplementation(async (review) => ({
        ...review,
        status: ReviewStatus.APPROVED,
      }));
      mockVariantService.selectVariant.mockResolvedValue(mockVariant);

      const result = await service.approveReview(mockReviewItem.id, 'user@example.com');

      expect(result).not.toBeNull();
      expect(result!.status).toBe(ReviewStatus.APPROVED);
      expect(result!.reviewedBy).toBe('user@example.com');
      expect(result!.reviewedAt).toBeDefined();
    });

    it('should return null if review not found', async () => {
      mockReviewRepository.findOne.mockResolvedValue(null);

      const result = await service.approveReview('nonexistent', 'user@example.com');

      expect(result).toBeNull();
    });
  });

  describe('rejectReview', () => {
    it('should reject a review with reason', async () => {
      mockReviewRepository.findOne.mockResolvedValue(mockReviewItem);
      mockReviewRepository.save.mockResolvedValue({
        ...mockReviewItem,
        status: ReviewStatus.REJECTED,
        rejectionReason: 'Too salesy',
      });

      const result = await service.rejectReview(
        mockReviewItem.id,
        'user@example.com',
        'Too salesy',
      );

      expect(result).not.toBeNull();
      expect(result!.status).toBe(ReviewStatus.REJECTED);
      expect(result!.rejectionReason).toBe('Too salesy');
    });
  });

  describe('editAndApprove', () => {
    it('should save edits and approve', async () => {
      mockReviewRepository.findOne.mockResolvedValue(mockReviewItem);
      mockReviewRepository.save.mockResolvedValue({
        ...mockReviewItem,
        status: ReviewStatus.EDITED,
        editedSubject: 'New subject',
        editedBody: 'New body',
      });
      mockVariantService.selectVariant.mockResolvedValue(mockVariant);

      const result = await service.editAndApprove(
        mockReviewItem.id,
        'user@example.com',
        'New subject',
        'New body',
      );

      expect(result).not.toBeNull();
      expect(result!.status).toBe(ReviewStatus.EDITED);
      expect(result!.editedSubject).toBe('New subject');
      expect(result!.editedBody).toBe('New body');
    });
  });

  describe('bulkApprove', () => {
    it('should approve multiple reviews', async () => {
      const reviewIds = ['review-1', 'review-2', 'review-3'];
      const reviews = reviewIds.map((id) => ({
        ...mockReviewItem,
        id,
      }));

      mockReviewRepository.findOne.mockImplementation(async ({ where }) => {
        const id = (where as any).id;
        return reviews.find((r) => r.id === id) || null;
      });
      mockReviewRepository.save.mockImplementation(async (r) => ({
        ...r,
        status: ReviewStatus.APPROVED,
      }));
      mockVariantService.selectVariant.mockResolvedValue(mockVariant);

      const result = await service.bulkApprove(reviewIds, 'user@example.com');

      expect(result.approved).toBe(3);
      expect(result.failed).toBe(0);
    });

    it('should handle partial failures', async () => {
      const reviewIds = ['review-1', 'review-2'];

      mockReviewRepository.findOne.mockResolvedValueOnce(mockReviewItem);
      mockReviewRepository.findOne.mockResolvedValueOnce(null);
      mockReviewRepository.save.mockResolvedValue({
        ...mockReviewItem,
        status: ReviewStatus.APPROVED,
      });
      mockVariantService.selectVariant.mockResolvedValue(mockVariant);

      const result = await service.bulkApprove(reviewIds, 'user@example.com');

      expect(result.approved).toBe(1);
      expect(result.failed).toBe(1);
    });
  });

  describe('bulkReject', () => {
    it('should reject multiple reviews', async () => {
      const reviewIds = ['review-1', 'review-2'];
      const reviews = reviewIds.map((id) => ({
        ...mockReviewItem,
        id,
      }));

      mockReviewRepository.findOne.mockImplementation(async ({ where }) => {
        const id = (where as any).id;
        return reviews.find((r) => r.id === id) || null;
      });
      mockReviewRepository.save.mockImplementation(async (r) => ({
        ...r,
        status: ReviewStatus.REJECTED,
      }));

      const result = await service.bulkReject(
        reviewIds,
        'user@example.com',
        'Not relevant',
      );

      expect(result.rejected).toBe(2);
      expect(result.failed).toBe(0);
    });
  });

  describe('getReviewStats', () => {
    it('should return review statistics', async () => {
      mockReviewRepository.count.mockResolvedValueOnce(10); // pending
      mockReviewRepository.count.mockResolvedValueOnce(50); // approved
      mockReviewRepository.count.mockResolvedValueOnce(5); // rejected
      mockReviewRepository.count.mockResolvedValueOnce(15); // edited

      const result = await service.getReviewStats(mockAccountId);

      expect(result.pending).toBe(10);
      expect(result.approved).toBe(50);
      expect(result.rejected).toBe(5);
      expect(result.edited).toBe(15);
      expect(result.total).toBe(80);
    });
  });

  describe('autoApproveByRules', () => {
    it('should auto-approve messages matching rules', async () => {
      const pendingReviews = [
        { ...mockReviewItem, id: 'review-1', companyName: 'Trusted Corp' },
        { ...mockReviewItem, id: 'review-2', companyName: 'Other Corp' },
      ];

      mockReviewRepository.find.mockResolvedValue(pendingReviews);
      mockReviewRepository.save.mockImplementation(async (r) => r);
      mockVariantService.selectVariant.mockResolvedValue(mockVariant);

      const rules = {
        trustedCompanies: ['Trusted Corp'],
      };

      const result = await service.autoApproveByRules(mockAccountId, rules);

      expect(result.autoApproved).toBe(1);
      expect(result.remaining).toBe(1);
    });
  });

  describe('requestRegeneration', () => {
    it('should mark review for regeneration and delete from queue', async () => {
      mockReviewRepository.findOne.mockResolvedValue(mockReviewItem);
      mockReviewRepository.delete.mockResolvedValue({ affected: 1 });

      const result = await service.requestRegeneration(mockReviewItem.id);

      expect(result.deleted).toBe(true);
      expect(result.variantId).toBe(mockVariantId);
      expect(mockReviewRepository.delete).toHaveBeenCalled();
    });
  });
});
