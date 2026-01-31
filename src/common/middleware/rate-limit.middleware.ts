import { Injectable, NestMiddleware, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  keyPrefix: string; // Prefix for Redis keys
}

/**
 * Rate limit check result
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter?: number;
  resetAt?: Date;
}

/**
 * HubSpot API rate limit configuration (100 requests per 10 seconds)
 */
export const HUBSPOT_RATE_LIMIT: RateLimitConfig = {
  windowMs: 10000, // 10 seconds
  maxRequests: 100,
  keyPrefix: 'hubspot',
};

/**
 * Default API rate limit configuration
 */
export const DEFAULT_API_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60000, // 1 minute
  maxRequests: 100,
  keyPrefix: 'api',
};

/**
 * Service for managing rate limits using Redis
 */
@Injectable()
export class RateLimitService {
  constructor(private readonly redis: Redis) {}

  /**
   * Generate Redis key for rate limiting
   */
  private getKey(identifier: string, prefix: string): string {
    const windowId = Math.floor(Date.now() / 10000); // 10-second windows
    return `ratelimit:${prefix}:${identifier}:${windowId}`;
  }

  /**
   * Check if a request is allowed under the rate limit
   */
  async checkRateLimit(
    identifier: string,
    config: RateLimitConfig,
  ): Promise<RateLimitResult> {
    const key = this.getKey(identifier, config.keyPrefix);

    // Increment counter and set expiry atomically
    const results = await this.redis
      .multi()
      .incr(key)
      .pexpire(key, config.windowMs)
      .exec();

    if (!results) {
      // Redis error - allow request but log warning
      return { allowed: true, remaining: config.maxRequests };
    }

    const [[, count]] = results as [[null, number], [null, number]];
    const currentCount = count as number;

    if (currentCount > config.maxRequests) {
      const ttl = await this.redis.ttl(key);
      return {
        allowed: false,
        remaining: 0,
        retryAfter: ttl > 0 ? ttl : Math.ceil(config.windowMs / 1000),
        resetAt: new Date(Date.now() + (ttl > 0 ? ttl * 1000 : config.windowMs)),
      };
    }

    return {
      allowed: true,
      remaining: config.maxRequests - currentCount,
    };
  }

  /**
   * Get remaining requests for an identifier
   */
  async getRemainingRequests(
    identifier: string,
    config: RateLimitConfig,
  ): Promise<number> {
    const key = this.getKey(identifier, config.keyPrefix);
    const count = await this.redis.get(key);

    if (!count) {
      return config.maxRequests;
    }

    return Math.max(0, config.maxRequests - parseInt(count, 10));
  }

  /**
   * Reset rate limit for an identifier
   */
  async resetRateLimit(identifier: string, prefix: string): Promise<void> {
    const pattern = `ratelimit:${prefix}:${identifier}:*`;
    const keys = await this.redis.keys(pattern);

    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}

/**
 * Rate limiting middleware for HTTP requests
 */
@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  constructor(
    private readonly rateLimitService: RateLimitService,
    private readonly config: RateLimitConfig = DEFAULT_API_RATE_LIMIT,
  ) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    // Use IP address or authenticated user ID as identifier
    const identifier = (req.ip || req.socket.remoteAddress || 'unknown') as string;

    const result = await this.rateLimitService.checkRateLimit(identifier, this.config);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', this.config.maxRequests);
    res.setHeader('X-RateLimit-Remaining', result.remaining);

    if (result.resetAt) {
      res.setHeader('X-RateLimit-Reset', result.resetAt.toISOString());
    }

    if (!result.allowed) {
      res.setHeader('Retry-After', result.retryAfter || 60);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Rate limit exceeded',
          retryAfter: result.retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    next();
  }
}
