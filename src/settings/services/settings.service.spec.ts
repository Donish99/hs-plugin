import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SettingsService } from './settings.service';
import { HubspotAccount, AccountPlan } from '../../entities/hubspot-account.entity';

describe('SettingsService', () => {
  let service: SettingsService;

  const mockAccountRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        {
          provide: getRepositoryToken(HubspotAccount),
          useValue: mockAccountRepository,
        },
      ],
    }).compile();

    service = module.get<SettingsService>(SettingsService);

    jest.clearAllMocks();
  });

  describe('getSettings', () => {
    const accountId = 'account-123';

    it('should return account settings', async () => {
      const mockAccount: Partial<HubspotAccount> = {
        id: accountId,
        portalId: 12345,
        companyName: 'Test Company',
        settings: {
          timezone: 'America/New_York',
          businessHoursOnly: true,
          autoApprove: false,
          defaultTone: 'professional',
          notificationEmail: 'admin@test.com',
        },
        plan: AccountPlan.PROFESSIONAL,
        monthlyEmailLimit: 1000,
        emailsSentThisMonth: 250,
      };

      mockAccountRepository.findOne.mockResolvedValue(mockAccount);

      const settings = await service.getSettings(accountId);

      expect(settings).toBeDefined();
      expect(settings.timezone).toBe('America/New_York');
      expect(settings.businessHoursOnly).toBe(true);
      expect(settings.autoApprove).toBe(false);
      expect(settings.defaultTone).toBe('professional');
    });

    it('should return default settings for new account', async () => {
      const mockAccount: Partial<HubspotAccount> = {
        id: accountId,
        portalId: 12345,
        settings: {},
        plan: AccountPlan.FREE,
      };

      mockAccountRepository.findOne.mockResolvedValue(mockAccount);

      const settings = await service.getSettings(accountId);

      expect(settings.timezone).toBe('UTC');
      expect(settings.businessHoursOnly).toBe(false);
      expect(settings.autoApprove).toBe(false);
      expect(settings.defaultTone).toBe('professional');
    });

    it('should throw error when account not found', async () => {
      mockAccountRepository.findOne.mockResolvedValue(null);

      await expect(service.getSettings(accountId)).rejects.toThrow('Account not found');
    });
  });

  describe('updateSettings', () => {
    const accountId = 'account-123';

    it('should update account settings', async () => {
      const mockAccount: Partial<HubspotAccount> = {
        id: accountId,
        settings: {
          timezone: 'UTC',
          businessHoursOnly: false,
        },
      };

      mockAccountRepository.findOne.mockResolvedValue(mockAccount);
      mockAccountRepository.save.mockResolvedValue({
        ...mockAccount,
        settings: {
          timezone: 'America/Los_Angeles',
          businessHoursOnly: true,
        },
      });

      const updatedSettings = await service.updateSettings(accountId, {
        timezone: 'America/Los_Angeles',
        businessHoursOnly: true,
      });

      expect(updatedSettings.timezone).toBe('America/Los_Angeles');
      expect(updatedSettings.businessHoursOnly).toBe(true);
      expect(mockAccountRepository.save).toHaveBeenCalled();
    });

    it('should merge settings without overwriting unset values', async () => {
      const mockAccount: Partial<HubspotAccount> = {
        id: accountId,
        settings: {
          timezone: 'UTC',
          businessHoursOnly: true,
          defaultTone: 'professional',
        },
      };

      mockAccountRepository.findOne.mockResolvedValue(mockAccount);
      mockAccountRepository.save.mockImplementation((entity) => Promise.resolve(entity));

      await service.updateSettings(accountId, {
        timezone: 'America/New_York',
      });

      expect(mockAccountRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({
            timezone: 'America/New_York',
            businessHoursOnly: true,
            defaultTone: 'professional',
          }),
        }),
      );
    });

    it('should validate timezone format', async () => {
      const mockAccount: Partial<HubspotAccount> = {
        id: accountId,
        settings: {},
      };

      mockAccountRepository.findOne.mockResolvedValue(mockAccount);

      await expect(
        service.updateSettings(accountId, { timezone: 'Invalid/Timezone' }),
      ).rejects.toThrow('Invalid timezone');
    });
  });

  describe('getSendingLimits', () => {
    const accountId = 'account-123';

    it('should return sending limits for account', async () => {
      const mockAccount: Partial<HubspotAccount> = {
        id: accountId,
        plan: AccountPlan.PROFESSIONAL,
        monthlyEmailLimit: 1000,
        emailsSentThisMonth: 250,
      };

      mockAccountRepository.findOne.mockResolvedValue(mockAccount);

      const limits = await service.getSendingLimits(accountId);

      expect(limits.monthlyLimit).toBe(1000);
      expect(limits.monthlyUsed).toBe(250);
      expect(limits.monthlyRemaining).toBe(750);
    });

    it('should include daily and hourly limits based on plan', async () => {
      const mockAccount: Partial<HubspotAccount> = {
        id: accountId,
        plan: AccountPlan.ENTERPRISE,
        monthlyEmailLimit: 10000,
        emailsSentThisMonth: 500,
      };

      mockAccountRepository.findOne.mockResolvedValue(mockAccount);

      const limits = await service.getSendingLimits(accountId);

      expect(limits.dailyLimit).toBeDefined();
      expect(limits.hourlyLimit).toBeDefined();
    });
  });

  describe('updateSendingLimits', () => {
    const accountId = 'account-123';

    it('should update sending limits', async () => {
      const mockAccount: Partial<HubspotAccount> = {
        id: accountId,
        plan: AccountPlan.PROFESSIONAL,
        monthlyEmailLimit: 1000,
      };

      mockAccountRepository.findOne.mockResolvedValue(mockAccount);
      mockAccountRepository.save.mockImplementation((entity) => Promise.resolve(entity));

      await service.updateSendingLimits(accountId, {
        monthlyLimit: 2000,
      });

      expect(mockAccountRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          monthlyEmailLimit: 2000,
        }),
      );
    });

    it('should not allow exceeding plan limits', async () => {
      const mockAccount: Partial<HubspotAccount> = {
        id: accountId,
        plan: AccountPlan.FREE,
        monthlyEmailLimit: 100,
      };

      mockAccountRepository.findOne.mockResolvedValue(mockAccount);

      await expect(service.updateSendingLimits(accountId, { monthlyLimit: 500 })).rejects.toThrow(
        'Exceeds plan limit',
      );
    });
  });

  describe('getAiSettings', () => {
    const accountId = 'account-123';

    it('should return AI settings', async () => {
      const mockAccount: Partial<HubspotAccount> = {
        id: accountId,
        settings: {
          defaultTone: 'friendly',
          autoApprove: true,
        },
      };

      mockAccountRepository.findOne.mockResolvedValue(mockAccount);

      const aiSettings = await service.getAiSettings(accountId);

      expect(aiSettings.tonePreference).toBe('friendly');
      expect(aiSettings.autoApprove).toBe(true);
    });

    it('should return default AI settings', async () => {
      const mockAccount: Partial<HubspotAccount> = {
        id: accountId,
        settings: {},
      };

      mockAccountRepository.findOne.mockResolvedValue(mockAccount);

      const aiSettings = await service.getAiSettings(accountId);

      expect(aiSettings.tonePreference).toBe('professional');
      expect(aiSettings.autoApprove).toBe(false);
      expect(aiSettings.autoApproveThreshold).toBe(0.8);
    });
  });

  describe('updateAiSettings', () => {
    const accountId = 'account-123';

    it('should update AI settings', async () => {
      const mockAccount: Partial<HubspotAccount> = {
        id: accountId,
        settings: {
          defaultTone: 'professional',
          autoApprove: false,
        },
      };

      mockAccountRepository.findOne.mockResolvedValue(mockAccount);
      mockAccountRepository.save.mockImplementation((entity) => Promise.resolve(entity));

      await service.updateAiSettings(accountId, {
        tonePreference: 'casual',
        autoApprove: true,
        autoApproveThreshold: 0.9,
      });

      expect(mockAccountRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({
            defaultTone: 'casual',
            autoApprove: true,
          }),
        }),
      );
    });

    it('should validate auto-approve threshold range', async () => {
      const mockAccount: Partial<HubspotAccount> = {
        id: accountId,
        settings: {},
      };

      mockAccountRepository.findOne.mockResolvedValue(mockAccount);

      await expect(
        service.updateAiSettings(accountId, { autoApproveThreshold: 1.5 }),
      ).rejects.toThrow('Threshold must be between 0 and 1');
    });
  });

  describe('getNotificationPreferences', () => {
    const accountId = 'account-123';

    it('should return notification preferences', async () => {
      const mockAccount: Partial<HubspotAccount> = {
        id: accountId,
        settings: {
          notificationEmail: 'admin@test.com',
        },
      };

      mockAccountRepository.findOne.mockResolvedValue(mockAccount);

      const preferences = await service.getNotificationPreferences(accountId);

      expect(preferences.email).toBe('admin@test.com');
    });
  });
});
