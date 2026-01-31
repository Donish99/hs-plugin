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
import { HubspotAccount } from '../entities/hubspot-account.entity';
import { CampaignsModule } from '../campaigns/campaigns.module';

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
    ),

    // TypeORM for account access
    TypeOrmModule.forFeature([HubspotAccount]),

    // CampaignsModule for scanner and rules services
    CampaignsModule,
  ],
  providers: [
    DormancyScanProcessor,
    DormancyScanScheduler,
    SendCampaignProcessor,
    WebhookProcessor,
  ],
  exports: [BullModule, DormancyScanProcessor, DormancyScanScheduler],
})
export class JobsModule {}
