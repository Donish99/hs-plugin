import { Campaign, CampaignStatus } from './campaign.entity';

describe('Campaign Entity', () => {
  describe('creation', () => {
    it('should create a valid Campaign instance', () => {
      const campaign = new Campaign();
      campaign.accountId = 'account-123';
      campaign.ruleId = 'rule-456';
      campaign.name = 'Q1 Reactivation';

      expect(campaign.name).toBe('Q1 Reactivation');
    });

    it('should have default status of draft', () => {
      const campaign = new Campaign();

      expect(campaign.status).toBe(CampaignStatus.DRAFT);
    });

    it('should have default stats of zero', () => {
      const campaign = new Campaign();

      expect(campaign.totalContacts).toBe(0);
      expect(campaign.emailsSent).toBe(0);
      expect(campaign.emailsOpened).toBe(0);
      expect(campaign.emailsReplied).toBe(0);
      expect(campaign.meetingsBooked).toBe(0);
    });

    it('should have default requiresReview of false', () => {
      const campaign = new Campaign();

      expect(campaign.requiresReview).toBe(false);
    });

    it('should allow setting requiresReview to true', () => {
      const campaign = new Campaign();
      campaign.requiresReview = true;

      expect(campaign.requiresReview).toBe(true);
    });
  });

  describe('status transitions', () => {
    it('should allow transition from draft to scheduled', () => {
      const campaign = new Campaign();
      campaign.status = CampaignStatus.DRAFT;

      expect(campaign.canTransitionTo(CampaignStatus.SCHEDULED)).toBe(true);
    });

    it('should allow transition from scheduled to running', () => {
      const campaign = new Campaign();
      campaign.status = CampaignStatus.SCHEDULED;

      expect(campaign.canTransitionTo(CampaignStatus.RUNNING)).toBe(true);
    });

    it('should allow transition from running to completed', () => {
      const campaign = new Campaign();
      campaign.status = CampaignStatus.RUNNING;

      expect(campaign.canTransitionTo(CampaignStatus.COMPLETED)).toBe(true);
    });

    it('should allow transition from running to paused', () => {
      const campaign = new Campaign();
      campaign.status = CampaignStatus.RUNNING;

      expect(campaign.canTransitionTo(CampaignStatus.PAUSED)).toBe(true);
    });

    it('should not allow transition from completed to running', () => {
      const campaign = new Campaign();
      campaign.status = CampaignStatus.COMPLETED;

      expect(campaign.canTransitionTo(CampaignStatus.RUNNING)).toBe(false);
    });
  });

  describe('metrics', () => {
    it('should calculate open rate correctly', () => {
      const campaign = new Campaign();
      campaign.emailsSent = 100;
      campaign.emailsOpened = 25;

      expect(campaign.getOpenRate()).toBe(25);
    });

    it('should calculate reply rate correctly', () => {
      const campaign = new Campaign();
      campaign.emailsSent = 100;
      campaign.emailsReplied = 10;

      expect(campaign.getReplyRate()).toBe(10);
    });

    it('should return 0 for rates when no emails sent', () => {
      const campaign = new Campaign();
      campaign.emailsSent = 0;

      expect(campaign.getOpenRate()).toBe(0);
      expect(campaign.getReplyRate()).toBe(0);
    });
  });
});
