import { Test, TestingModule } from '@nestjs/testing';
import { TokenValidationMiddleware } from './token-validation.middleware';
import { OAuthService } from '../services/oauth.service';
import { UnauthorizedException } from '@nestjs/common';

describe('TokenValidationMiddleware', () => {
  let middleware: TokenValidationMiddleware;
  let oauthService: OAuthService;

  const mockOAuthService = {
    getValidAccessToken: jest.fn(),
    getAccountByPortalId: jest.fn(),
  };

  const mockRequest = () => {
    const req: any = {
      headers: {},
      query: {},
      params: {},
    };
    return req;
  };

  const mockResponse = () => {
    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    return res;
  };

  const mockNext = jest.fn();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenValidationMiddleware,
        {
          provide: OAuthService,
          useValue: mockOAuthService,
        },
      ],
    }).compile();

    middleware = module.get<TokenValidationMiddleware>(TokenValidationMiddleware);
    oauthService = module.get<OAuthService>(OAuthService);

    jest.clearAllMocks();
  });

  describe('use', () => {
    it('should call next() when valid portal ID is provided in header', async () => {
      const req = mockRequest();
      req.headers['x-portal-id'] = '12345';
      const res = mockResponse();

      mockOAuthService.getAccountByPortalId.mockResolvedValue({
        id: 'uuid',
        portalId: 12345,
        accessToken: 'valid-token',
        refreshToken: 'refresh-token',
        tokenExpiresAt: new Date(Date.now() + 1800000),
      });

      await middleware.use(req as any, res as any, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(req['portalId']).toBe(12345);
      expect(req['accessToken']).toBe('valid-token');
    });

    it('should call next() when valid portal ID is provided in query', async () => {
      const req = mockRequest();
      req.query['portal_id'] = '12345';
      const res = mockResponse();

      mockOAuthService.getAccountByPortalId.mockResolvedValue({
        id: 'uuid',
        portalId: 12345,
        accessToken: 'valid-token',
        refreshToken: 'refresh-token',
        tokenExpiresAt: new Date(Date.now() + 1800000),
      });

      await middleware.use(req as any, res as any, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should call next() when valid portal ID is provided in params', async () => {
      const req = mockRequest();
      req.params['portalId'] = '12345';
      const res = mockResponse();

      mockOAuthService.getAccountByPortalId.mockResolvedValue({
        id: 'uuid',
        portalId: 12345,
        accessToken: 'valid-token',
        refreshToken: 'refresh-token',
        tokenExpiresAt: new Date(Date.now() + 1800000),
      });

      await middleware.use(req as any, res as any, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when portal ID is missing', async () => {
      const req = mockRequest();
      const res = mockResponse();

      await expect(
        middleware.use(req as any, res as any, mockNext),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when portal ID is invalid', async () => {
      const req = mockRequest();
      req.headers['x-portal-id'] = 'not-a-number';
      const res = mockResponse();

      await expect(
        middleware.use(req as any, res as any, mockNext),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when account not found', async () => {
      const req = mockRequest();
      req.headers['x-portal-id'] = '12345';
      const res = mockResponse();

      mockOAuthService.getAccountByPortalId.mockResolvedValue(null);

      await expect(
        middleware.use(req as any, res as any, mockNext),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should attach portalId and accessToken to request object', async () => {
      const req = mockRequest();
      req.headers['x-portal-id'] = '12345';
      const res = mockResponse();

      mockOAuthService.getAccountByPortalId.mockResolvedValue({
        id: 'uuid',
        portalId: 12345,
        accessToken: 'valid-token',
        refreshToken: 'refresh-token',
        tokenExpiresAt: new Date(Date.now() + 1800000),
      });

      await middleware.use(req as any, res as any, mockNext);

      expect(req['portalId']).toBe(12345);
      expect(req['accessToken']).toBe('valid-token');
    });

    it('should refresh token if expiring soon', async () => {
      const req = mockRequest();
      req.headers['x-portal-id'] = '12345';
      const res = mockResponse();

      // Token expiring in 30 seconds
      mockOAuthService.getAccountByPortalId.mockResolvedValue({
        id: 'uuid',
        portalId: 12345,
        accessToken: 'old-token',
        refreshToken: 'refresh-token',
        tokenExpiresAt: new Date(Date.now() + 30000),
      });

      mockOAuthService.getValidAccessToken.mockResolvedValue('new-token');

      await middleware.use(req as any, res as any, mockNext);

      expect(mockOAuthService.getValidAccessToken).toHaveBeenCalledWith(12345);
      expect(req['accessToken']).toBe('new-token');
    });
  });

  describe('header priority', () => {
    it('should prioritize header over query parameter', async () => {
      const req = mockRequest();
      req.headers['x-portal-id'] = '11111';
      req.query['portal_id'] = '22222';
      const res = mockResponse();

      mockOAuthService.getAccountByPortalId.mockResolvedValue({
        id: 'uuid',
        portalId: 11111,
        accessToken: 'valid-token',
        refreshToken: 'refresh-token',
        tokenExpiresAt: new Date(Date.now() + 1800000),
      });

      await middleware.use(req as any, res as any, mockNext);

      expect(mockOAuthService.getAccountByPortalId).toHaveBeenCalledWith(11111);
    });

    it('should prioritize query over params', async () => {
      const req = mockRequest();
      req.query['portal_id'] = '22222';
      req.params['portalId'] = '33333';
      const res = mockResponse();

      mockOAuthService.getAccountByPortalId.mockResolvedValue({
        id: 'uuid',
        portalId: 22222,
        accessToken: 'valid-token',
        refreshToken: 'refresh-token',
        tokenExpiresAt: new Date(Date.now() + 1800000),
      });

      await middleware.use(req as any, res as any, mockNext);

      expect(mockOAuthService.getAccountByPortalId).toHaveBeenCalledWith(22222);
    });
  });
});
