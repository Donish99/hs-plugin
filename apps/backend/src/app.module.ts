import { Module, NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TerminusModule } from '@nestjs/terminus';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './health/health.controller';
import { HubspotModule } from './hubspot/hubspot.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { AiModule } from './ai/ai.module';
import { OutreachModule } from './outreach/outreach.module';
import { JobsModule } from './jobs/jobs.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { SettingsModule } from './settings/settings.module';
import { EventsModule } from './events/events.module';
import { getDatabaseConfig } from './config/database.config';
import { TokenValidationMiddleware } from './hubspot/middleware/token-validation.middleware';
import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
      load: [configuration],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => getDatabaseConfig(configService),
    }),
    TerminusModule,
    EventsModule,
    HubspotModule,
    CampaignsModule,
    AiModule,
    OutreachModule,
    JobsModule,
    AnalyticsModule,
    SettingsModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply TokenValidationMiddleware to all authenticated routes
    consumer
      .apply(TokenValidationMiddleware)
      .exclude(
        // Exclude public routes
        { path: 'api/hubspot/oauth/(.*)', method: RequestMethod.ALL },
        { path: 'api/hubspot/webhooks', method: RequestMethod.POST },
        { path: 'health', method: RequestMethod.GET },
        { path: '/', method: RequestMethod.GET },
      )
      .forRoutes(
        // Apply to account-scoped routes
        { path: 'api/accounts/:accountId/*', method: RequestMethod.ALL },
        { path: 'api/v1/accounts/:accountId/*', method: RequestMethod.ALL },
      );
  }
}
