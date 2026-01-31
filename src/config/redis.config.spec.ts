import { getRedisConfig, getQueueConfig } from './redis.config';

describe('Redis Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('getRedisConfig', () => {
    it('should return default Redis URL when not configured', () => {
      delete process.env.REDIS_URL;
      const config = getRedisConfig();

      expect(config.host).toBe('localhost');
      expect(config.port).toBe(6379);
    });

    it('should parse Redis URL from environment', () => {
      process.env.REDIS_URL = 'redis://myhost:6380';
      const config = getRedisConfig();

      expect(config.host).toBe('myhost');
      expect(config.port).toBe(6380);
    });

    it('should parse Redis URL with password', () => {
      process.env.REDIS_URL = 'redis://:mypassword@myhost:6380';
      const config = getRedisConfig();

      expect(config.host).toBe('myhost');
      expect(config.port).toBe(6380);
      expect(config.password).toBe('mypassword');
    });

    it('should enable TLS for rediss:// URLs', () => {
      process.env.REDIS_URL = 'rediss://secure-host:6380';
      const config = getRedisConfig();

      expect(config.tls).toBeDefined();
    });
  });

  describe('getQueueConfig', () => {
    it('should return queue configuration with Redis settings', () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      const config = getQueueConfig();

      expect(config.redis).toBeDefined();
      expect(config.defaultJobOptions).toBeDefined();
    });

    it('should set default job options', () => {
      const config = getQueueConfig();

      expect(config.defaultJobOptions?.attempts).toBeGreaterThan(0);
      expect(config.defaultJobOptions?.backoff).toBeDefined();
      expect(config.defaultJobOptions?.removeOnComplete).toBe(true);
    });

    it('should configure exponential backoff', () => {
      const config = getQueueConfig();
      const backoff = config.defaultJobOptions?.backoff;

      expect(backoff).toEqual({
        type: 'exponential',
        delay: 1000,
      });
    });
  });
});
