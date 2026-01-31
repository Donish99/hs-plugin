import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { OAuthController } from './oauth.controller';
import { OAuthService, TokenResponse } from '../services/oauth.service';

describe('OAuthController', () => {
  let controller: OAuthController;
  let oauthService: OAuthService;

  const mockOAuthService = {
    getAuthorizationUrl: jest.fn(),
    exchangeCodeForTokens: jest.fn(),
    saveAccount: jest.fn(),
    getAccountByPortalId: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OAuthController],
      providers: [
        {
          provide: OAuthService,
          useValue: mockOAuthService,
        },
      ],
    }).compile();

    controller = module.get<OAuthController>(OAuthController);
    oauthService = module.get<OAuthService>(OAuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('install', () => {
    it('should redirect to HubSpot authorization URL', () => {
      const mockAuthUrl = 'https://app.hubspot.com/oauth/authorize?client_id=test';
      mockOAuthService.getAuthorizationUrl.mockReturnValue(mockAuthUrl);

      const result = controller.install();

      expect(mockOAuthService.getAuthorizationUrl).toHaveBeenCalled();
      expect(result).toEqual({ url: mockAuthUrl });
    });

    it('should include required scopes in authorization URL', () => {
      const mockAuthUrl = 'https://app.hubspot.com/oauth/authorize';
      mockOAuthService.getAuthorizationUrl.mockReturnValue(mockAuthUrl);

      controller.install();

      expect(mockOAuthService.getAuthorizationUrl).toHaveBeenCalledWith(
        expect.arrayContaining([
          'crm.objects.contacts.read',
          'crm.objects.contacts.write',
        ]),
        expect.any(String),
      );
    });
  });

  describe('callback', () => {
    const mockTokenResponse: TokenResponse = {
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      expiresIn: 1800,
    };

    const mockAccount = {
      id: 'uuid',
      portalId: 12345,
      accessTokenEncrypted: 'encrypted',
      refreshTokenEncrypted: 'encrypted',
      tokenExpiresAt: new Date(),
    };

    it('should exchange code for tokens and save account', async () => {
      const code = 'test-auth-code';
      const portalId = '12345';

      mockOAuthService.exchangeCodeForTokens.mockResolvedValue(mockTokenResponse);
      mockOAuthService.saveAccount.mockResolvedValue(mockAccount);

      const result = await controller.callback(code, portalId);

      expect(mockOAuthService.exchangeCodeForTokens).toHaveBeenCalledWith(code);
      expect(mockOAuthService.saveAccount).toHaveBeenCalledWith(
        12345,
        mockTokenResponse,
      );
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('portalId', 12345);
    });

    it('should throw BadRequestException when code is missing', async () => {
      await expect(controller.callback('', '12345')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when portal ID is missing', async () => {
      await expect(controller.callback('code', '')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw UnauthorizedException when token exchange fails', async () => {
      const code = 'invalid-code';
      const portalId = '12345';

      mockOAuthService.exchangeCodeForTokens.mockRejectedValue(
        new Error('Invalid code'),
      );

      await expect(controller.callback(code, portalId)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should handle state parameter for security validation', async () => {
      const code = 'test-code';
      const portalId = '12345';
      const state = 'random-state';

      mockOAuthService.exchangeCodeForTokens.mockResolvedValue(mockTokenResponse);
      mockOAuthService.saveAccount.mockResolvedValue(mockAccount);

      // State validation is optional but should not throw if valid
      const result = await controller.callback(code, portalId, state);

      expect(result.success).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle HubSpot error callback', async () => {
      const error = 'access_denied';
      const errorDescription = 'User denied access';

      await expect(
        controller.handleError(error, errorDescription),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should include error description in exception', async () => {
      const error = 'access_denied';
      const errorDescription = 'User denied access';

      try {
        await controller.handleError(error, errorDescription);
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(UnauthorizedException);
        expect((e as UnauthorizedException).message).toContain(errorDescription);
      }
    });
  });

  describe('status', () => {
    it('should return account status for valid portal ID', async () => {
      const portalId = 12345;

      mockOAuthService.getAccountByPortalId.mockResolvedValue({
        id: 'uuid',
        portalId,
        accessToken: 'token',
        refreshToken: 'refresh',
        tokenExpiresAt: new Date(Date.now() + 1800000),
      });

      const result = await controller.getStatus(portalId);

      expect(result).toHaveProperty('connected', true);
      expect(result).toHaveProperty('portalId', portalId);
    });

    it('should return not connected for unknown portal ID', async () => {
      const portalId = 99999;

      mockOAuthService.getAccountByPortalId.mockResolvedValue(null);

      const result = await controller.getStatus(portalId);

      expect(result).toHaveProperty('connected', false);
    });

    it('should indicate if token is expired', async () => {
      const portalId = 12345;

      mockOAuthService.getAccountByPortalId.mockResolvedValue({
        id: 'uuid',
        portalId,
        accessToken: 'token',
        refreshToken: 'refresh',
        tokenExpiresAt: new Date(Date.now() - 1000), // Expired
      });

      const result = await controller.getStatus(portalId);

      expect(result).toHaveProperty('connected', true);
      expect(result).toHaveProperty('tokenExpired', true);
    });
  });
});
