import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { OutreachRecord } from '../entities/outreach-record.entity';
import { Campaign } from '../entities/campaign.entity';
import { Response } from '../entities/response.entity';
import { MessageVariant } from '../entities/message-variant.entity';
import { MetricsService } from './services/metrics.service';
import { RoiService } from './services/roi.service';
import { AbTestService } from './services/ab-test.service';
import { ActivityLogService } from './services/activity-log.service';
import { DashboardController } from './controllers/dashboard.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([OutreachRecord, Campaign, Response, MessageVariant]),
    ConfigModule,
  ],
  controllers: [DashboardController],
  providers: [MetricsService, RoiService, AbTestService, ActivityLogService],
  exports: [MetricsService, RoiService, AbTestService, ActivityLogService],
})
export class AnalyticsModule {}
