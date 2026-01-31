import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OAuthService } from './oauth.service';
import { HubspotAccount } from '../../entities/hubspot-account.entity';

describe('OAuthService', () => {
  let service: OAuthService;
  let configService: ConfigService;
  let accountRepository: Repository<HubspotAccount>;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, string> = {
        HUBSPOT_CLIENT_ID: 'test-client-id',
        HUBSPOT_CLIENT_SECRET: 'test-client-secret',
        APP_URL: 'http://localhost:3000',
        ENCRYPTION_KEY: 'test-encryption-key-32-chars-ok!',
      };
      return config[key];
    }),
    getOrThrow: jest.fn((key: string) => {
      const config: Record<string, string> = {
        HUBSPOT_CLIENT_ID: 'test-client-id',
        HUBSPOT_CLIENT_SECRET: 'test-client-secret',
        APP_URL: 'http://localhost:3000',
        ENCRYPTION_KEY: 'test-encryption-key-32-chars-ok!',
      };
      if (!config[key]) throw new Error(`Missing config: ${key}`);
      return config[key];
    }),
  };

  const mockAccountRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };

  // Mock HubSpot API client
  const mockHubspotClient = {
    oauth: {
      tokensApi: {
        create: jest.fn(),
      },
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OAuthService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: getRepositoryToken(HubspotAccount),
          useValue: mockAccountRepository,
        },
      ],
    }).compile();

    service = module.get<OAuthService>(OAuthService);
    configService = module.get<ConfigService>(ConfigService);
    accountRepository = module.get<Repository<HubspotAccount>>(
      getRepositoryToken(HubspotAccount),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getAuthorizationUrl', () => {
    it('should generate a valid HubSpot authorization URL', () => {
      const scopes = ['crm.objects.contacts.read', 'crm.objects.contacts.write'];
      const state = 'random-state-string';

      const url = service.getAuthorizationUrl(scopes, state);

      expect(url).toContain('https://app.hubspot.com/oauth/authorize');
      expect(url).toContain('client_id=test-client-id');
      expect(url).toContain('redirect_uri=');
      expect(url).toContain('state=' + state);
      expect(url).toContain('scope=');
    });

    it('should include all requested scopes in the URL', () => {
      const scopes = [
        'crm.objects.contacts.read',
        'crm.objects.contacts.write',
        'crm.objects.deals.read',
      ];

      const url = service.getAuthorizationUrl(scopes);

      scopes.forEach((scope) => {
        expect(url).toContain(encodeURIComponent(scope));
      });
    });

    it('should use the correct redirect URI from config', () => {
      const url = service.getAuthorizationUrl(['crm.objects.contacts.read']);

      expect(url).toContain(
        encodeURIComponent('http://localhost:3000/api/hubspot/oauth/callback'),
      );
    });

    it('should generate state if not provided', () => {
      const url = service.getAuthorizationUrl(['crm.objects.contacts.read']);

      expect(url).toContain('state=');
    });
  });

  describe('exchangeCodeForTokens', () => {
    const mockTokenResponse = {
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      expiresIn: 1800,
    };

    it('should exchange authorization code for tokens', async () => {
      const code = 'test-auth-code';

      // Mock the internal HubSpot client call
      jest
        .spyOn(service as any, 'exchangeWithHubspot')
        .mockResolvedValue(mockTokenResponse);

      const result = await service.exchangeCodeForTokens(code);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('expiresIn');
    });

    it('should throw error for invalid authorization code', async () => {
      const invalidCode = '';

      await expect(service.exchangeCodeForTokens(invalidCode)).rejects.toThrow();
    });

    it('should throw error when HubSpot API returns error', async () => {
      const code = 'test-auth-code';

      jest
        .spyOn(service as any, 'exchangeWithHubspot')
        .mockRejectedValue(new Error('Invalid code'));

      await expect(service.exchangeCodeForTokens(code)).rejects.toThrow(
        'Invalid code',
      );
    });
  });

  describe('refreshAccessToken', () => {
    const mockRefreshResponse = {
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      expiresIn: 1800,
    };

    it('should refresh tokens using refresh token', async () => {
      const refreshToken = 'test-refresh-token';

      jest
        .spyOn(service as any, 'refreshWithHubspot')
        .mockResolvedValue(mockRefreshResponse);

      const result = await service.refreshAccessToken(refreshToken);

      expect(result.accessToken).toBe('new-access-token');
      expect(result.refreshToken).toBe('new-refresh-token');
    });

    it('should throw error for invalid refresh token', async () => {
      const invalidRefreshToken = '';

      await expect(
        service.refreshAccessToken(invalidRefreshToken),
      ).rejects.toThrow();
    });

    it('should throw error when refresh token is expired', async () => {
      const expiredRefreshToken = 'expired-token';

      jest
        .spyOn(service as any, 'refreshWithHubspot')
        .mockRejectedValue(new Error('Refresh token expired'));

      await expect(
        service.refreshAccessToken(expiredRefreshToken),
      ).rejects.toThrow('Refresh token expired');
    });
  });

  describe('encryption', () => {
    it('should encrypt a token', () => {
      const plainToken = 'my-secret-token';

      const encrypted = service.encryptToken(plainToken);

      expect(encrypted).not.toBe(plainToken);
      expect(encrypted.length).toBeGreaterThan(0);
    });

    it('should decrypt an encrypted token', () => {
      const plainToken = 'my-secret-token';

      const encrypted = service.encryptToken(plainToken);
      const decrypted = service.decryptToken(encrypted);

      expect(decrypted).toBe(plainToken);
    });

    it('should produce different ciphertext for same plaintext (due to IV)', () => {
      const plainToken = 'my-secret-token';

      const encrypted1 = service.encryptToken(plainToken);
      const encrypted2 = service.encryptToken(plainToken);

      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should throw error when decrypting invalid data', () => {
      const invalidEncrypted = 'not-valid-encrypted-data';

      expect(() => service.decryptToken(invalidEncrypted)).toThrow();
    });
  });

  describe('saveAccount', () => {
    const mockTokens = {
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      expiresIn: 1800,
    };

    it('should create a new account if not exists', async () => {
      const portalId = 12345;
      mockAccountRepository.findOne.mockResolvedValue(null);
      mockAccountRepository.create.mockReturnValue({
        portalId,
        accessTokenEncrypted: '',
        refreshTokenEncrypted: '',
        tokenExpiresAt: new Date(),
      });
      mockAccountRepository.save.mockResolvedValue({
        id: 'uuid',
        portalId,
      });

      const result = await service.saveAccount(portalId, mockTokens);

      expect(mockAccountRepository.findOne).toHaveBeenCalledWith({
        where: { portalId },
      });
      expect(mockAccountRepository.create).toHaveBeenCalled();
      expect(mockAccountRepository.save).toHaveBeenCalled();
      expect(result.portalId).toBe(portalId);
    });

    it('should update existing account', async () => {
      const portalId = 12345;
      const existingAccount = {
        id: 'existing-uuid',
        portalId,
        accessTokenEncrypted: 'old-encrypted',
        refreshTokenEncrypted: 'old-encrypted',
        tokenExpiresAt: new Date(),
      };

      mockAccountRepository.findOne.mockResolvedValue(existingAccount);
      mockAccountRepository.save.mockResolvedValue(existingAccount);

      const result = await service.saveAccount(portalId, mockTokens);

      expect(mockAccountRepository.findOne).toHaveBeenCalledWith({
        where: { portalId },
      });
      expect(mockAccountRepository.create).not.toHaveBeenCalled();
      expect(mockAccountRepository.save).toHaveBeenCalled();
    });

    it('should store tokens in encrypted form', async () => {
      const portalId = 12345;
      mockAccountRepository.findOne.mockResolvedValue(null);
      mockAccountRepository.create.mockImplementation((data) => data);
      mockAccountRepository.save.mockImplementation((data) =>
        Promise.resolve({ id: 'uuid', ...data }),
      );

      await service.saveAccount(portalId, mockTokens);

      const savedData = mockAccountRepository.save.mock.calls[0][0];
      expect(savedData.accessTokenEncrypted).not.toBe(mockTokens.accessToken);
      expect(savedData.refreshTokenEncrypted).not.toBe(mockTokens.refreshToken);
    });

    it('should calculate correct token expiration time', async () => {
      const portalId = 12345;
      const expiresIn = 1800; // 30 minutes
      const now = Date.now();

      mockAccountRepository.findOne.mockResolvedValue(null);
      mockAccountRepository.create.mockImplementation((data) => data);
      mockAccountRepository.save.mockImplementation((data) =>
        Promise.resolve({ id: 'uuid', ...data }),
      );

      await service.saveAccount(portalId, { ...mockTokens, expiresIn });

      const savedData = mockAccountRepository.save.mock.calls[0][0];
      const expectedExpiry = now + expiresIn * 1000;
      const actualExpiry = savedData.tokenExpiresAt.getTime();

      // Allow 1 second tolerance for test execution time
      expect(actualExpiry).toBeGreaterThanOrEqual(expectedExpiry - 1000);
      expect(actualExpiry).toBeLessThanOrEqual(expectedExpiry + 1000);
    });
  });

  describe('getAccountByPortalId', () => {
    it('should return account with decrypted tokens', async () => {
      const portalId = 12345;
      const plainAccessToken = 'plain-access-token';
      const plainRefreshToken = 'plain-refresh-token';

      // First encrypt the tokens to simulate stored data
      const encryptedAccess = service.encryptToken(plainAccessToken);
      const encryptedRefresh = service.encryptToken(plainRefreshToken);

      mockAccountRepository.findOne.mockResolvedValue({
        id: 'uuid',
        portalId,
        accessTokenEncrypted: encryptedAccess,
        refreshTokenEncrypted: encryptedRefresh,
        tokenExpiresAt: new Date(Date.now() + 1800000),
      });

      const result = await service.getAccountByPortalId(portalId);

      expect(result).not.toBeNull();
      expect(result?.accessToken).toBe(plainAccessToken);
      expect(result?.refreshToken).toBe(plainRefreshToken);
    });

    it('should return null if account not found', async () => {
      const portalId = 99999;
      mockAccountRepository.findOne.mockResolvedValue(null);

      const result = await service.getAccountByPortalId(portalId);

      expect(result).toBeNull();
    });
  });

  describe('getValidAccessToken', () => {
    it('should return existing token if not expired', async () => {
      const portalId = 12345;
      const validToken = 'valid-access-token';
      const encryptedToken = service.encryptToken(validToken);

      mockAccountRepository.findOne.mockResolvedValue({
        id: 'uuid',
        portalId,
        accessTokenEncrypted: encryptedToken,
        refreshTokenEncrypted: service.encryptToken('refresh-token'),
        tokenExpiresAt: new Date(Date.now() + 1800000), // Not expired
        isTokenExpiringSoon: () => false,
      });

      const result = await service.getValidAccessToken(portalId);

      expect(result).toBe(validToken);
    });

    it('should refresh and return new token if expiring soon', async () => {
      const portalId = 12345;
      const oldToken = 'old-access-token';
      const newToken = 'new-access-token';
      const refreshToken = 'refresh-token';

      const encryptedOld = service.encryptToken(oldToken);
      const encryptedRefresh = service.encryptToken(refreshToken);

      const mockAccount = {
        id: 'uuid',
        portalId,
        accessTokenEncrypted: encryptedOld,
        refreshTokenEncrypted: encryptedRefresh,
        tokenExpiresAt: new Date(Date.now() + 30000), // Expiring in 30 seconds
        isTokenExpiringSoon: () => true,
      };

      mockAccountRepository.findOne.mockResolvedValue(mockAccount);

      jest.spyOn(service, 'refreshAccessToken').mockResolvedValue({
        accessToken: newToken,
        refreshToken: 'new-refresh-token',
        expiresIn: 1800,
      });

      jest.spyOn(service, 'saveAccount').mockResolvedValue({
        ...mockAccount,
        accessTokenEncrypted: service.encryptToken(newToken),
      } as HubspotAccount);

      const result = await service.getValidAccessToken(portalId);

      expect(service.refreshAccessToken).toHaveBeenCalled();
      expect(result).toBe(newToken);
    });

    it('should throw error if account not found', async () => {
      const portalId = 99999;
      mockAccountRepository.findOne.mockResolvedValue(null);

      await expect(service.getValidAccessToken(portalId)).rejects.toThrow(
        'Account not found',
      );
    });
  });
});
