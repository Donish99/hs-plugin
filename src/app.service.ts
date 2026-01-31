import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Application info returned by the root endpoint
 */
export interface AppInfo {
  name: string;
  version: string;
  status: string;
  environment: string;
}

@Injectable()
export class AppService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Returns application metadata and status
   */
  getAppInfo(): AppInfo {
    return {
      name: 'HubSpot Dormant Lead Reactivation Plugin',
      version: '0.1.0',
      status: 'running',
      environment: this.configService.get<string>('NODE_ENV') || 'development',
    };
  }
}
