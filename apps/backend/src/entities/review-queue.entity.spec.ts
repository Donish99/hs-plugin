import { ReviewQueue, ReviewStatus } from './review-queue.entity';

describe('ReviewQueue Entity', () => {
  let review: ReviewQueue;

  beforeEach(() => {
    review = new ReviewQueue();
    review.id = 'review-uuid-123';
    review.accountId = 'account-uuid-123';
    review.variantId = 'variant-uuid-123';
    review.hubspotContactId = 12345;
    review.contactName = 'John Doe';
    review.contactEmail = 'john@example.com';
    review.companyName = 'Acme Corp';
    review.originalSubject = 'Quick check-in';
    review.originalBody = 'Hi John, hope you are doing well...';
    review.status = ReviewStatus.PENDING;
    review.autoApproved = false;
    review.priority = 0;
    review.createdAt = new Date();
    review.updatedAt = new Date();
  });

  describe('isPending', () => {
    it('should return true when status is pending', () => {
      review.status = ReviewStatus.PENDING;
      expect(review.isPending()).toBe(true);
    });

    it('should return false when status is approved', () => {
      review.status = ReviewStatus.APPROVED;
      expect(review.isPending()).toBe(false);
    });

    it('should return false when status is rejected', () => {
      review.status = ReviewStatus.REJECTED;
      expect(review.isPending()).toBe(false);
    });

    it('should return false when status is edited', () => {
      review.status = ReviewStatus.EDITED;
      expect(review.isPending()).toBe(false);
    });
  });

  describe('isApproved', () => {
    it('should return true when status is approved', () => {
      review.status = ReviewStatus.APPROVED;
      expect(review.isApproved()).toBe(true);
    });

    it('should return true when status is edited', () => {
      review.status = ReviewStatus.EDITED;
      expect(review.isApproved()).toBe(true);
    });

    it('should return false when status is pending', () => {
      review.status = ReviewStatus.PENDING;
      expect(review.isApproved()).toBe(false);
    });

    it('should return false when status is rejected', () => {
      review.status = ReviewStatus.REJECTED;
      expect(review.isApproved()).toBe(false);
    });
  });

  describe('isRejected', () => {
    it('should return true when status is rejected', () => {
      review.status = ReviewStatus.REJECTED;
      expect(review.isRejected()).toBe(true);
    });

    it('should return false when status is approved', () => {
      review.status = ReviewStatus.APPROVED;
      expect(review.isRejected()).toBe(false);
    });

    it('should return false when status is pending', () => {
      review.status = ReviewStatus.PENDING;
      expect(review.isRejected()).toBe(false);
    });
  });

  describe('getFinalSubject', () => {
    it('should return original subject when not edited', () => {
      expect(review.getFinalSubject()).toBe('Quick check-in');
    });

    it('should return edited subject when edited', () => {
      review.editedSubject = 'Updated subject';
      expect(review.getFinalSubject()).toBe('Updated subject');
    });
  });

  describe('getFinalBody', () => {
    it('should return original body when not edited', () => {
      expect(review.getFinalBody()).toBe('Hi John, hope you are doing well...');
    });

    it('should return edited body when edited', () => {
      review.editedBody = 'Updated body content';
      expect(review.getFinalBody()).toBe('Updated body content');
    });
  });

  describe('wasEdited', () => {
    it('should return false when no edits made', () => {
      expect(review.wasEdited()).toBe(false);
    });

    it('should return true when status is edited', () => {
      review.status = ReviewStatus.EDITED;
      expect(review.wasEdited()).toBe(true);
    });

    it('should return true when subject was edited', () => {
      review.editedSubject = 'Different subject';
      expect(review.wasEdited()).toBe(true);
    });

    it('should return true when body was edited', () => {
      review.editedBody = 'Different body';
      expect(review.wasEdited()).toBe(true);
    });

    it('should return false when edited subject is same as original', () => {
      review.editedSubject = review.originalSubject;
      review.editedBody = undefined;
      expect(review.wasEdited()).toBe(false);
    });
  });

  describe('entity properties', () => {
    it('should have all required properties', () => {
      expect(review.id).toBeDefined();
      expect(review.accountId).toBeDefined();
      expect(review.variantId).toBeDefined();
      expect(review.hubspotContactId).toBeDefined();
      expect(review.originalSubject).toBeDefined();
      expect(review.originalBody).toBeDefined();
    });

    it('should support optional campaign association', () => {
      review.campaignId = 'campaign-uuid-123';
      expect(review.campaignId).toBe('campaign-uuid-123');
    });

    it('should track review metadata', () => {
      review.reviewedBy = 'user@example.com';
      review.reviewedAt = new Date('2024-01-15');
      review.rejectionReason = 'Too salesy';

      expect(review.reviewedBy).toBe('user@example.com');
      expect(review.reviewedAt).toEqual(new Date('2024-01-15'));
      expect(review.rejectionReason).toBe('Too salesy');
    });

    it('should support priority levels', () => {
      review.priority = 5;
      expect(review.priority).toBe(5);
    });
  });

  describe('default values', () => {
    it('should default status to pending', () => {
      const newReview = new ReviewQueue();
      expect(newReview.status).toBe(ReviewStatus.PENDING);
    });

    it('should default autoApproved to false', () => {
      const newReview = new ReviewQueue();
      expect(newReview.autoApproved).toBe(false);
    });

    it('should default priority to 0', () => {
      const newReview = new ReviewQueue();
      expect(newReview.priority).toBe(0);
    });
  });

  describe('ReviewStatus enum', () => {
    it('should have all status values', () => {
      expect(ReviewStatus.PENDING).toBe('pending');
      expect(ReviewStatus.APPROVED).toBe('approved');
      expect(ReviewStatus.REJECTED).toBe('rejected');
      expect(ReviewStatus.EDITED).toBe('edited');
    });
  });
});
