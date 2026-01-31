import { HubspotAccount, AccountPlan } from './hubspot-account.entity';

describe('HubspotAccount Entity', () => {
  describe('creation', () => {
    it('should create a valid HubspotAccount instance', () => {
      const account = new HubspotAccount();
      account.portalId = 12345678;
      account.companyName = 'Test Company';
      account.accessTokenEncrypted = 'encrypted-token';
      account.refreshTokenEncrypted = 'encrypted-refresh';
      account.tokenExpiresAt = new Date();

      expect(account.portalId).toBe(12345678);
      expect(account.companyName).toBe('Test Company');
    });

    it('should have default values for optional fields', () => {
      const account = new HubspotAccount();

      expect(account.settings).toEqual({});
      expect(account.plan).toBe(AccountPlan.FREE);
      expect(account.monthlyEmailLimit).toBe(100);
      expect(account.emailsSentThisMonth).toBe(0);
    });
  });

  describe('email limits', () => {
    it('should correctly identify when at email limit', () => {
      const account = new HubspotAccount();
      account.monthlyEmailLimit = 100;
      account.emailsSentThisMonth = 100;

      expect(account.isAtEmailLimit()).toBe(true);
    });

    it('should correctly identify when below email limit', () => {
      const account = new HubspotAccount();
      account.monthlyEmailLimit = 100;
      account.emailsSentThisMonth = 50;

      expect(account.isAtEmailLimit()).toBe(false);
    });

    it('should return remaining email count', () => {
      const account = new HubspotAccount();
      account.monthlyEmailLimit = 100;
      account.emailsSentThisMonth = 75;

      expect(account.getRemainingEmails()).toBe(25);
    });
  });

  describe('token expiry', () => {
    it('should identify expired tokens', () => {
      const account = new HubspotAccount();
      account.tokenExpiresAt = new Date(Date.now() - 60000); // 1 minute ago

      expect(account.isTokenExpired()).toBe(true);
    });

    it('should identify valid tokens', () => {
      const account = new HubspotAccount();
      account.tokenExpiresAt = new Date(Date.now() + 3600000); // 1 hour from now

      expect(account.isTokenExpired()).toBe(false);
    });

    it('should identify tokens expiring soon (within buffer)', () => {
      const account = new HubspotAccount();
      account.tokenExpiresAt = new Date(Date.now() + 30000); // 30 seconds from now

      expect(account.isTokenExpiringSoon(60000)).toBe(true); // 1 minute buffer
    });
  });
});
