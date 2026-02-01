import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import Redis from 'ioredis';
import { getRedisConfig } from '../../config/redis.config';

/**
 * Service for managing OAuth state parameter for CSRF protection.
 * Uses Redis to store state with TTL for one-time use validation.
 */
@Injectable()
export class OAuthStateService implements OnModuleDestroy {
  private readonly logger = new Logger(OAuthStateService.name);
  private readonly redis: Redis;
  private readonly STATE_PREFIX = 'oauth:state:';
  private readonly STATE_TTL_SECONDS = 600; // 10 minutes

  constructor(private readonly configService: ConfigService) {
    const redisConfig = getRedisConfig();
    this.redis = new Redis({
      host: redisConfig.host,
      port: redisConfig.port,
      password: redisConfig.password,
      tls: redisConfig.tls,
      lazyConnect: true,
    });

    this.redis.on('error', (err) => {
      this.logger.error('Redis connection error', err);
    });

    this.redis.connect().catch((err) => {
      this.logger.error('Failed to connect to Redis', err);
    });
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }

  /**
   * Generate a cryptographically secure state parameter and store it in Redis.
   * @returns The generated state string
   */
  async generateState(): Promise<string> {
    const state = crypto.randomBytes(32).toString('hex');
    const key = `${this.STATE_PREFIX}${state}`;

    // Store state with TTL - value is just a timestamp for debugging
    await this.redis.setex(key, this.STATE_TTL_SECONDS, Date.now().toString());

    this.logger.debug(`Generated OAuth state: ${state.substring(0, 8)}...`);
    return state;
  }

  /**
   * Validate and consume a state parameter (one-time use).
   * @param state The state parameter to validate
   * @returns true if valid and consumed, false otherwise
   */
  async validateAndConsumeState(state: string): Promise<boolean> {
    if (!state || state.length !== 64) {
      this.logger.warn('Invalid state format');
      return false;
    }

    const key = `${this.STATE_PREFIX}${state}`;

    // Use GETDEL for atomic get-and-delete (one-time use)
    const result = await this.redis.getdel(key);

    if (result) {
      this.logger.debug(`Validated and consumed OAuth state: ${state.substring(0, 8)}...`);
      return true;
    }

    this.logger.warn(`Invalid or expired OAuth state: ${state.substring(0, 8)}...`);
    return false;
  }

  /**
   * Check if a state exists without consuming it (for debugging).
   * @param state The state parameter to check
   * @returns true if exists, false otherwise
   */
  async stateExists(state: string): Promise<boolean> {
    const key = `${this.STATE_PREFIX}${state}`;
    const exists = await this.redis.exists(key);
    return exists === 1;
  }
}
