import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailService } from './services/email.service';
import { SmsService } from './services/sms.service';
import { HubspotLoggerService } from './services/hubspot-logger.service';
import { CampaignExecutorService } from './services/campaign-executor.service';
import { DeliveryStatusService } from './services/delivery-status.service';
import { HubspotSequencesService } from './services/hubspot-sequences.service';
import { HubspotModule } from '../hubspot/hubspot.module';
import { AiModule } from '../ai/ai.module';
import { OutreachRecord } from '../entities/outreach-record.entity';
import { Campaign } from '../entities/campaign.entity';

/**
 * Outreach module - handles email and SMS sending with HubSpot logging
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([OutreachRecord, Campaign]),
    HubspotModule,
    AiModule,
  ],
  providers: [
    EmailService,
    SmsService,
    HubspotLoggerService,
    CampaignExecutorService,
    DeliveryStatusService,
    HubspotSequencesService,
    // Provide Twilio client factory
    {
      provide: 'TWILIO_CLIENT',
      useFactory: (configService: ConfigService) => {
        const accountSid = configService.get<string>('twilio.accountSid');
        const authToken = configService.get<string>('twilio.authToken');
        if (accountSid && authToken) {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const Twilio = require('twilio');
          return new Twilio(accountSid, authToken);
        }
        return null;
      },
      inject: [ConfigService],
    },
  ],
  exports: [
    EmailService,
    SmsService,
    HubspotLoggerService,
    CampaignExecutorService,
    DeliveryStatusService,
    HubspotSequencesService,
  ],
})
export class OutreachModule {}
