import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { getDatabaseConfig } from '../config/database.config';

import { HubspotAccount } from '../entities/hubspot-account.entity';
import { DormancyRule } from '../entities/dormancy-rule.entity';
import { Campaign } from '../entities/campaign.entity';
import { OutreachRecord } from '../entities/outreach-record.entity';
import { Response } from '../entities/response.entity';

/**
 * All entity classes for registration
 */
export const entities = [HubspotAccount, DormancyRule, Campaign, OutreachRecord, Response];

/**
 * Database module - configures TypeORM connection
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        ...getDatabaseConfig(configService),
        autoLoadEntities: true,
      }),
    }),
    TypeOrmModule.forFeature(entities),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
