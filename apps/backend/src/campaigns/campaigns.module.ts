import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { DormancyRule } from '../entities/dormancy-rule.entity';
import { Campaign } from '../entities/campaign.entity';
import { OutreachRecord } from '../entities/outreach-record.entity';
import { DormancyRulesService } from './services/dormancy-rules.service';
import { QueryBuilderService } from './services/query-builder.service';
import { ScannerService } from './services/scanner.service';
import { DormancyDetectionService } from './services/dormancy-detection.service';
import { CampaignService } from './services/campaign.service';
import { ActionsService } from './services/actions.service';
import { RulesController } from './controllers/rules.controller';
import { DormantLeadsController } from './controllers/dormant-leads.controller';
import { CampaignsController } from './controllers/campaigns.controller';
import { HubspotModule } from '../hubspot/hubspot.module';
import { OutreachModule } from '../outreach/outreach.module';
import { QUEUE_NAMES } from '../config/redis.config';

/**
 * Campaigns module - handles dormancy detection and campaign management
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([DormancyRule, Campaign, OutreachRecord]),
    BullModule.registerQueue({ name: QUEUE_NAMES.SEND_CAMPAIGN }),
    forwardRef(() => HubspotModule),
    forwardRef(() => OutreachModule),
  ],
  controllers: [RulesController, DormantLeadsController, CampaignsController],
  providers: [
    DormancyRulesService,
    QueryBuilderService,
    ScannerService,
    DormancyDetectionService,
    CampaignService,
    ActionsService,
  ],
  exports: [
    DormancyRulesService,
    QueryBuilderService,
    ScannerService,
    DormancyDetectionService,
    CampaignService,
    ActionsService,
  ],
})
export class CampaignsModule {}
