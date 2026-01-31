import { DataSource, DataSourceOptions } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { config } from 'dotenv';

import { HubspotAccount } from '../entities/hubspot-account.entity';
import { DormancyRule } from '../entities/dormancy-rule.entity';
import { Campaign } from '../entities/campaign.entity';
import { OutreachRecord } from '../entities/outreach-record.entity';
import { Response } from '../entities/response.entity';
import { InitialSchema1706700000000 } from '../migrations/1706700000000-InitialSchema';

// Load environment variables for CLI commands
config();

/**
 * Get database configuration options
 */
export const getDatabaseConfig = (configService?: ConfigService): DataSourceOptions => {
  const databaseUrl =
    configService?.get<string>('DATABASE_URL') ||
    process.env.DATABASE_URL ||
    'postgresql://localhost:5432/hubspot_dormant_leads';

  return {
    type: 'postgres',
    url: databaseUrl,
    entities: [HubspotAccount, DormancyRule, Campaign, OutreachRecord, Response],
    migrations: [InitialSchema1706700000000],
    migrationsTableName: 'migrations',
    synchronize: false, // Never use in production
    logging: process.env.NODE_ENV === 'development',
    ssl:
      process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false,
    extra: {
      // Connection pool settings
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    },
  };
};

/**
 * TypeORM DataSource for CLI migrations
 */
export default new DataSource(getDatabaseConfig());
