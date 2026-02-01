import { BullModuleOptions } from '@nestjs/bull';

/**
 * Redis connection configuration
 */
export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  tls?: object;
}

/**
 * Parse Redis URL and extract connection parameters
 */
export function parseRedisUrl(url: string): RedisConfig {
  const parsed = new URL(url);
  const config: RedisConfig = {
    host: parsed.hostname || 'localhost',
    port: parseInt(parsed.port, 10) || 6379,
  };

  // Extract password if present
  if (parsed.password) {
    config.password = parsed.password;
  }

  // Enable TLS for rediss:// protocol
  if (parsed.protocol === 'rediss:') {
    config.tls = {
      rejectUnauthorized: false,
    };
  }

  return config;
}

/**
 * Get Redis configuration from environment
 */
export function getRedisConfig(): RedisConfig {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  return parseRedisUrl(redisUrl);
}

/**
 * Get Bull queue configuration
 */
export function getQueueConfig(): BullModuleOptions {
  const redisConfig = getRedisConfig();

  return {
    redis: {
      host: redisConfig.host,
      port: redisConfig.port,
      password: redisConfig.password,
      tls: redisConfig.tls,
    },
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    },
  };
}

/**
 * Queue names used in the application
 */
export const QUEUE_NAMES = {
  DORMANCY_SCAN: 'dormancy-scan',
  SEND_CAMPAIGN: 'send-campaign',
  WEBHOOK_PROCESS: 'webhook-process',
  TOKEN_REFRESH: 'token-refresh',
  CONTACT_SYNC: 'contact-sync',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
