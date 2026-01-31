import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QUEUE_NAMES, getQueueConfig } from '../config/redis.config';
import { DormancyScanProcessor } from './dormancy-scan.processor';
import { DormancyScanScheduler } from './dormancy-scan.scheduler';
import { SendCampaignProcessor } from './send-campaign.processor';
import { WebhookProcessor } from './webhook.processor';
import { ClassificationProcessor } from './classification.processor';
import { HubspotAccount } from '../entities/hubspot-account.entity';
import { OutreachRecord } from '../entities/outreach-record.entity';
import { Response } from '../entities/response.entity';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { AiModule } from '../ai/ai.module';
import { HubspotModule } from '../hubspot/hubspot.module';

/**
 * Jobs module - configures Bull queues, processors, and schedulers
 */
@Module({
  imports: [
    // Enable cron job scheduling
    ScheduleModule.forRoot(),

    // Register Bull queues
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: () => getQueueConfig(),
    }),

    // Register individual queues
    BullModule.registerQueue(
      { name: QUEUE_NAMES.DORMANCY_SCAN },
      { name: QUEUE_NAMES.SEND_CAMPAIGN },
      { name: QUEUE_NAMES.WEBHOOK_PROCESS },
      { name: QUEUE_NAMES.TOKEN_REFRESH },
      { name: QUEUE_NAMES.CONTACT_SYNC },
      { name: 'classification' },
    ),

    // TypeORM for account access
    TypeOrmModule.forFeature([HubspotAccount, OutreachRecord, Response]),

    // CampaignsModule for scanner and rules services
    CampaignsModule,

    // AiModule for classification
    AiModule,

    // HubspotModule for contact service
    HubspotModule,
  ],
  providers: [
    DormancyScanProcessor,
    DormancyScanScheduler,
    SendCampaignProcessor,
    WebhookProcessor,
    ClassificationProcessor,
  ],
  exports: [BullModule, DormancyScanProcessor, DormancyScanScheduler],
})
export class JobsModule {}
