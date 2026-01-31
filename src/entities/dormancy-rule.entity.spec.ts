import { DormancyRule, ActionType } from './dormancy-rule.entity';

describe('DormancyRule Entity', () => {
  describe('creation', () => {
    it('should create a valid DormancyRule instance', () => {
      const rule = new DormancyRule();
      rule.accountId = 'account-123';
      rule.name = '30-Day Inactive Rule';
      rule.criteria = {
        min_days_inactive: 30,
        no_email_opens_days: 14,
      };
      rule.actionType = ActionType.EMAIL;
      rule.actionConfig = { template: 'reactivation-v1' };

      expect(rule.name).toBe('30-Day Inactive Rule');
      expect(rule.actionType).toBe(ActionType.EMAIL);
    });

    it('should default to active state', () => {
      const rule = new DormancyRule();

      expect(rule.isActive).toBe(true);
    });
  });

  describe('criteria validation', () => {
    it('should have valid criteria structure', () => {
      const rule = new DormancyRule();
      rule.criteria = {
        min_days_inactive: 30,
        no_email_opens_days: 14,
        deal_stages: ['qualifiedtobuy', 'presentationscheduled'],
        exclude_tags: ['vip', 'do-not-contact'],
        min_lead_score: 50,
      };

      expect(rule.criteria.min_days_inactive).toBe(30);
      expect(rule.criteria.deal_stages).toContain('qualifiedtobuy');
      expect(rule.criteria.exclude_tags).toHaveLength(2);
    });
  });

  describe('action types', () => {
    it('should support email action type', () => {
      const rule = new DormancyRule();
      rule.actionType = ActionType.EMAIL;

      expect(rule.actionType).toBe('email');
    });

    it('should support sms action type', () => {
      const rule = new DormancyRule();
      rule.actionType = ActionType.SMS;

      expect(rule.actionType).toBe('sms');
    });

    it('should support sequence action type', () => {
      const rule = new DormancyRule();
      rule.actionType = ActionType.SEQUENCE;

      expect(rule.actionType).toBe('sequence');
    });

    it('should support task action type', () => {
      const rule = new DormancyRule();
      rule.actionType = ActionType.TASK;

      expect(rule.actionType).toBe('task');
    });
  });
});
