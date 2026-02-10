import { OutreachRecord, OutreachStatus, OutreachChannel } from './outreach-record.entity';

describe('OutreachRecord Entity', () => {
  describe('creation', () => {
    it('should create a valid OutreachRecord instance', () => {
      const record = new OutreachRecord();
      record.campaignId = 'campaign-123';
      record.accountId = 'account-456';
      record.hubspotContactId = 12345;
      record.channel = OutreachChannel.EMAIL;
      record.contactEmail = 'test@example.com';

      expect(record.hubspotContactId).toBe(12345);
      expect(record.channel).toBe(OutreachChannel.EMAIL);
    });

    it('should have default status of pending', () => {
      const record = new OutreachRecord();

      expect(record.status).toBe(OutreachStatus.PENDING);
    });
  });

  describe('status tracking', () => {
    it('should support PENDING_REVIEW status for review queue flow', () => {
      const record = new OutreachRecord();
      record.status = OutreachStatus.PENDING_REVIEW;

      expect(record.status).toBe(OutreachStatus.PENDING_REVIEW);
      expect(record.isDelivered()).toBe(false);
      expect(record.isFailed()).toBe(false);
    });

    it('should track sent status', () => {
      const record = new OutreachRecord();
      record.status = OutreachStatus.SENT;
      record.sentAt = new Date();

      expect(record.status).toBe(OutreachStatus.SENT);
      expect(record.sentAt).toBeInstanceOf(Date);
    });

    it('should track opened status', () => {
      const record = new OutreachRecord();
      record.status = OutreachStatus.OPENED;
      record.openedAt = new Date();

      expect(record.status).toBe(OutreachStatus.OPENED);
      expect(record.openedAt).toBeInstanceOf(Date);
    });

    it('should track replied status', () => {
      const record = new OutreachRecord();
      record.status = OutreachStatus.REPLIED;
      record.repliedAt = new Date();

      expect(record.status).toBe(OutreachStatus.REPLIED);
      expect(record.repliedAt).toBeInstanceOf(Date);
    });

    it('should identify successful delivery', () => {
      const record = new OutreachRecord();
      record.status = OutreachStatus.DELIVERED;

      expect(record.isDelivered()).toBe(true);
    });

    it('should identify failed delivery', () => {
      const record = new OutreachRecord();
      record.status = OutreachStatus.BOUNCED;

      expect(record.isFailed()).toBe(true);
    });
  });

  describe('AI metadata', () => {
    it('should track AI token usage', () => {
      const record = new OutreachRecord();
      record.aiModel = 'gpt-4o';
      record.aiPromptTokens = 150;
      record.aiCompletionTokens = 75;

      expect(record.getTotalTokens()).toBe(225);
    });
  });

  describe('channels', () => {
    it('should support email channel', () => {
      const record = new OutreachRecord();
      record.channel = OutreachChannel.EMAIL;

      expect(record.isEmail()).toBe(true);
      expect(record.isSms()).toBe(false);
    });

    it('should support SMS channel', () => {
      const record = new OutreachRecord();
      record.channel = OutreachChannel.SMS;

      expect(record.isSms()).toBe(true);
      expect(record.isEmail()).toBe(false);
    });
  });

  describe('variant tracking', () => {
    it('should track variant ID', () => {
      const record = new OutreachRecord();
      record.variantId = 'variant-uuid-123';
      record.variantGroupId = 'group-uuid-456';
      record.selectedVariantIndex = 2;

      expect(record.variantId).toBe('variant-uuid-123');
      expect(record.variantGroupId).toBe('group-uuid-456');
      expect(record.selectedVariantIndex).toBe(2);
    });

    it('should detect variant tracking when variantId is set', () => {
      const record = new OutreachRecord();
      record.variantId = 'variant-uuid-123';

      expect(record.hasVariantTracking()).toBe(true);
    });

    it('should detect variant tracking when variantGroupId is set', () => {
      const record = new OutreachRecord();
      record.variantGroupId = 'group-uuid-456';

      expect(record.hasVariantTracking()).toBe(true);
    });

    it('should return false for hasVariantTracking when no variant info', () => {
      const record = new OutreachRecord();

      expect(record.hasVariantTracking()).toBe(false);
    });
  });
});
