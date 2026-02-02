import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { HubspotAccount } from '../entities/hubspot-account.entity';
import { OAuthService } from './services/oauth.service';
import { OAuthStateService } from './services/oauth-state.service';
import { ContactsService } from './services/contacts.service';
import { WebhooksService } from './services/webhooks.service';
import { TokenValidationMiddleware } from './middleware/token-validation.middleware';
import { OAuthController } from './controllers/oauth.controller';
import { WebhooksController } from './controllers/webhooks.controller';

/**
 * HubSpot module - handles OAuth, contacts, and webhook integrations
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([HubspotAccount]),
    BullModule.registerQueue({
      name: 'webhook-processing',
    }),
  ],
  controllers: [OAuthController, WebhooksController],
  providers: [OAuthService, OAuthStateService, ContactsService, WebhooksService, TokenValidationMiddleware],
  exports: [OAuthService, OAuthStateService, ContactsService, WebhooksService, TokenValidationMiddleware],
})
export class HubspotModule {}
