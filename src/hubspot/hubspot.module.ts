import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HubspotAccount } from '../entities/hubspot-account.entity';
import { OAuthService } from './services/oauth.service';
import { ContactsService } from './services/contacts.service';
import { OAuthController } from './controllers/oauth.controller';

/**
 * HubSpot module - handles OAuth, contacts, and webhook integrations
 */
@Module({
  imports: [TypeOrmModule.forFeature([HubspotAccount])],
  controllers: [OAuthController],
  providers: [OAuthService, ContactsService],
  exports: [OAuthService, ContactsService],
})
export class HubspotModule {}
