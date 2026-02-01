import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { getRedisConfig } from '../config/redis.config';
import { RateLimitService } from './middleware/rate-limit.middleware';

/**
 * Redis client provider
 */
const RedisProvider = {
  provide: 'REDIS_CLIENT',
  inject: [ConfigService],
  useFactory: (configService: ConfigService): Redis => {
    const redisConfig = getRedisConfig();
    return new Redis({
      host: redisConfig.host,
      port: redisConfig.port,
      password: redisConfig.password,
      tls: redisConfig.tls,
      retryStrategy: (times: number) => {
        if (times > 3) {
          return null; // Stop retrying
        }
        return Math.min(times * 200, 2000);
      },
    });
  },
};

/**
 * Rate limit service provider
 */
const RateLimitServiceProvider = {
  provide: RateLimitService,
  inject: ['REDIS_CLIENT'],
  useFactory: (redis: Redis): RateLimitService => {
    return new RateLimitService(redis);
  },
};

/**
 * Common module - provides shared services across the application
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [RedisProvider, RateLimitServiceProvider],
  exports: ['REDIS_CLIENT', RateLimitService],
})
export class CommonModule {}
