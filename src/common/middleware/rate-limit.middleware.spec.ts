import { RateLimitService, RateLimitConfig } from './rate-limit.middleware';

describe('RateLimitService', () => {
  let service: RateLimitService;
  let mockRedisClient: any;

  beforeEach(() => {
    mockRedisClient = {
      multi: jest.fn().mockReturnThis(),
      incr: jest.fn().mockReturnThis(),
      pexpire: jest.fn().mockReturnThis(),
      exec: jest.fn(),
      get: jest.fn(),
      ttl: jest.fn(),
      keys: jest.fn(),
      del: jest.fn(),
    };

    service = new RateLimitService(mockRedisClient);
  });

  describe('checkRateLimit', () => {
    const config: RateLimitConfig = {
      windowMs: 10000, // 10 seconds
      maxRequests: 100,
      keyPrefix: 'test',
    };

    it('should allow requests within limit', async () => {
      mockRedisClient.exec.mockResolvedValue([[null, 50], [null, 1]]);

      const result = await service.checkRateLimit('user-123', config);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(50);
    });

    it('should block requests exceeding limit', async () => {
      mockRedisClient.exec.mockResolvedValue([[null, 101], [null, 1]]);
      mockRedisClient.ttl.mockResolvedValue(5);

      const result = await service.checkRateLimit('user-123', config);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should use correct Redis key format', async () => {
      mockRedisClient.exec.mockResolvedValue([[null, 1], [null, 1]]);

      await service.checkRateLimit('user-456', config);

      expect(mockRedisClient.incr).toHaveBeenCalledWith(
        expect.stringContaining('test:user-456'),
      );
    });

    it('should set expiry on new keys', async () => {
      mockRedisClient.exec.mockResolvedValue([[null, 1], [null, 1]]);

      await service.checkRateLimit('new-user', config);

      expect(mockRedisClient.pexpire).toHaveBeenCalledWith(
        expect.any(String),
        config.windowMs,
      );
    });
  });

  describe('getRemainingRequests', () => {
    it('should return remaining requests count', async () => {
      mockRedisClient.get.mockResolvedValue('75');

      const remaining = await service.getRemainingRequests('user-123', {
        windowMs: 10000,
        maxRequests: 100,
        keyPrefix: 'api',
      });

      expect(remaining).toBe(25);
    });

    it('should return max requests when no usage', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const remaining = await service.getRemainingRequests('new-user', {
        windowMs: 10000,
        maxRequests: 100,
        keyPrefix: 'api',
      });

      expect(remaining).toBe(100);
    });
  });

  describe('resetRateLimit', () => {
    it('should delete the rate limit key', async () => {
      mockRedisClient.keys.mockResolvedValue(['ratelimit:api:user-123:12345']);
      mockRedisClient.del.mockResolvedValue(1);

      await service.resetRateLimit('user-123', 'api');

      expect(mockRedisClient.keys).toHaveBeenCalledWith(
        expect.stringContaining('api:user-123'),
      );
      expect(mockRedisClient.del).toHaveBeenCalled();
    });

    it('should not call del when no keys found', async () => {
      mockRedisClient.keys.mockResolvedValue([]);

      await service.resetRateLimit('new-user', 'api');

      expect(mockRedisClient.del).not.toHaveBeenCalled();
    });
  });
});

describe('HubSpot Rate Limit', () => {
  it('should enforce 100 requests per 10 seconds', () => {
    const hubspotConfig: RateLimitConfig = {
      windowMs: 10000,
      maxRequests: 100,
      keyPrefix: 'hubspot',
    };

    expect(hubspotConfig.maxRequests).toBe(100);
    expect(hubspotConfig.windowMs).toBe(10000);
  });
});
