import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HealthCheckResult,
  HealthIndicatorResult,
} from '@nestjs/terminus';

@Controller('health')
export class HealthController {
  constructor(private health: HealthCheckService) {}

  /**
   * Health check endpoint for monitoring
   * Returns status of all health indicators
   */
  @Get()
  @HealthCheck()
  async check(): Promise<HealthCheckResult> {
    return this.health.check([
      // App health indicator - always returns up if app is running
      async (): Promise<HealthIndicatorResult> => ({
        app: { status: 'up' },
      }),
    ]);
  }
}
