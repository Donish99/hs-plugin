import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuthController } from './oauth.controller';
import { OAuthService, TokenResponse } from '../services/oauth.service';
import { OAuthStateService } from '../services/oauth-state.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DormancyRule } from '../../entities/dormancy-rule.entity';
import { Response } from 'express';

describe('OAuthController', () => {
  let controller: OAuthController;

  const mockOAuthService = {
    getAuthorizationUrl: jest.fn(),
    exchangeCodeForTokens: jest.fn(),
    saveAccount: jest.fn(),
    getAccountByPortalId: jest.fn(),
    getTokenInfo: jest.fn(),
    revokeTokens: jest.fn(),
  };

  const mockOAuthStateService = {
    generateState: jest.fn(),
    validateAndConsumeState: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('http://localhost:5173'),
  };

  const mockDormancyRuleRepository = {
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn().mockImplementation((data) => data),
    save: jest.fn().mockResolvedValue([]),
  };

  const mockResponse = {
    redirect: jest.fn(),
  } as unknown as Response;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OAuthController],
      providers: [
        {
          provide: OAuthService,
          useValue: mockOAuthService,
        },
        {
          provide: OAuthStateService,
          useValue: mockOAuthStateService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: getRepositoryToken(DormancyRule),
          useValue: mockDormancyRuleRepository,
        },
      ],
    }).compile();

    controller = module.get<OAuthController>(OAuthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('install', () => {
    it('should return authorization URL and state', async () => {
      const mockAuthUrl = 'https://app.hubspot.com/oauth/authorize?client_id=test';
      const mockState = 'abc123def456';

      mockOAuthStateService.generateState.mockResolvedValue(mockState);
      mockOAuthService.getAuthorizationUrl.mockReturnValue(mockAuthUrl);

      const result = await controller.install();

      expect(mockOAuthStateService.generateState).toHaveBeenCalled();
      expect(mockOAuthService.getAuthorizationUrl).toHaveBeenCalledWith(
        expect.arrayContaining([
          'crm.objects.contacts.read',
          'crm.objects.contacts.write',
        ]),
        mockState,
      );
      expect(result).toEqual({ url: mockAuthUrl, state: mockState });
    });
  });

  describe('callback', () => {
    const mockTokenResponse: TokenResponse = {
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      expiresIn: 1800,
    };

    const mockAccount = {
      id: 'uuid-123',
      portalId: 12345,
      accessTokenEncrypted: 'encrypted',
      refreshTokenEncrypted: 'encrypted',
      tokenExpiresAt: new Date(),
    };

    it('should redirect with success when valid code and state', async () => {
      const code = 'test-auth-code';
      const state = 'valid-state';

      mockOAuthStateService.validateAndConsumeState.mockResolvedValue(true);
      mockOAuthService.exchangeCodeForTokens.mockResolvedValue(mockTokenResponse);
      mockOAuthService.getTokenInfo.mockResolvedValue({ hubId: 12345 });
      mockOAuthService.saveAccount.mockResolvedValue(mockAccount);

      await controller.callback(code, '', '', state, mockResponse);

      expect(mockOAuthStateService.validateAndConsumeState).toHaveBeenCalledWith(state);
      expect(mockOAuthService.exchangeCodeForTokens).toHaveBeenCalledWith(code);
      expect(mockOAuthService.saveAccount).toHaveBeenCalledWith(12345, mockTokenResponse);
      expect(mockResponse.redirect).toHaveBeenCalledWith(
        expect.stringContaining('success=true'),
      );
      expect(mockResponse.redirect).toHaveBeenCalledWith(
        expect.stringContaining('account_id=uuid-123'),
      );
    });

    it('should redirect with error when code is missing', async () => {
      await controller.callback('', '', '', 'state', mockResponse);

      expect(mockResponse.redirect).toHaveBeenCalledWith(
        expect.stringContaining('error=missing_code'),
      );
    });

    it('should redirect with error when state is missing', async () => {
      await controller.callback('code', '', '', '', mockResponse);

      expect(mockResponse.redirect).toHaveBeenCalledWith(
        expect.stringContaining('error=invalid_state'),
      );
    });

    it('should redirect with error when state is invalid', async () => {
      mockOAuthStateService.validateAndConsumeState.mockResolvedValue(false);

      await controller.callback('code', '', '', 'invalid-state', mockResponse);

      expect(mockResponse.redirect).toHaveBeenCalledWith(
        expect.stringContaining('error=invalid_state'),
      );
    });

    it('should redirect with HubSpot error when error param present', async () => {
      await controller.callback('', 'access_denied', 'User denied', 'state', mockResponse);

      expect(mockResponse.redirect).toHaveBeenCalledWith(
        expect.stringContaining('error=access_denied'),
      );
    });

    it('should redirect with error when token exchange fails', async () => {
      mockOAuthStateService.validateAndConsumeState.mockResolvedValue(true);
      mockOAuthService.exchangeCodeForTokens.mockRejectedValue(new Error('Invalid code'));

      await controller.callback('code', '', '', 'state', mockResponse);

      expect(mockResponse.redirect).toHaveBeenCalledWith(
        expect.stringContaining('error=auth_failed'),
      );
    });
  });

  describe('handleError', () => {
    it('should throw UnauthorizedException with error description', async () => {
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

  describe('getStatus', () => {
    it('should return account status with accountId for valid portal ID', async () => {
      const portalId = 12345;

      mockOAuthService.getAccountByPortalId.mockResolvedValue({
        id: 'uuid-123',
        portalId,
        accessToken: 'token',
        refreshToken: 'refresh',
        tokenExpiresAt: new Date(Date.now() + 1800000),
      });

      const result = await controller.getStatus(portalId);

      expect(result).toHaveProperty('connected', true);
      expect(result).toHaveProperty('portalId', portalId);
      expect(result).toHaveProperty('accountId', 'uuid-123');
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
        id: 'uuid-123',
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

  describe('disconnect', () => {
    it('should revoke tokens and return success', async () => {
      mockOAuthService.revokeTokens.mockResolvedValue(true);

      const result = await controller.disconnect(12345);

      expect(mockOAuthService.revokeTokens).toHaveBeenCalledWith(12345);
      expect(result).toEqual({ success: true });
    });

    it('should return success false when account not found', async () => {
      mockOAuthService.revokeTokens.mockResolvedValue(false);

      const result = await controller.disconnect(99999);

      expect(result).toEqual({ success: false });
    });
  });
});
