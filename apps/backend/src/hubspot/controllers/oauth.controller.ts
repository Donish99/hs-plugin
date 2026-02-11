import {
  Controller,
  Get,
  Post,
  Query,
  Res,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OAuthService } from '../services/oauth.service';
import { OAuthStateService } from '../services/oauth-state.service';
import { DormancyRule, ActionType } from '../../entities/dormancy-rule.entity';

/**
 * Default OAuth scopes required for the plugin
 * Note: automation.sequences.read requires Sales Hub Professional+
 */
const DEFAULT_SCOPES = [
  'crm.objects.contacts.read',
  'crm.objects.contacts.write',
  'crm.objects.deals.read',
  'crm.objects.companies.read',
  'crm.lists.read',
  'crm.objects.users.read',
  'sales-email-read',
  'oauth',
];

@Controller('api/hubspot/oauth')
export class OAuthController {
  private readonly logger = new Logger(OAuthController.name);
  private readonly frontendUrl: string;

  constructor(
    private readonly oauthService: OAuthService,
    private readonly oauthStateService: OAuthStateService,
    private readonly configService: ConfigService,
    @InjectRepository(DormancyRule)
    private readonly dormancyRuleRepository: Repository<DormancyRule>,
  ) {
    this.frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';
  }

  /**
   * Initiate HubSpot OAuth flow
   * Returns the authorization URL and state for the client to redirect to
   */
  @Get('install')
  async install(): Promise<{ url: string; state: string }> {
    const state = await this.oauthStateService.generateState();
    const url = this.oauthService.getAuthorizationUrl(DEFAULT_SCOPES, state);

    this.logger.log('Generated OAuth authorization URL with CSRF state');

    return { url, state };
  }

  /**
   * Handle OAuth callback from HubSpot
   * Exchange authorization code for tokens and redirect to frontend
   */
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('error') error: string,
    @Query('error_description') errorDescription: string,
    @Query('state') state?: string,
    @Res() res?: Response,
  ): Promise<void> {
    this.logger.log(
      `OAuth callback received - code: ${code ? 'yes' : 'no'}, error: ${error || 'none'}, state: ${state ? 'yes' : 'no'}`,
    );

    // Handle HubSpot error response
    if (error) {
      this.logger.error(`HubSpot OAuth error: ${error} - ${errorDescription}`);
      return res?.redirect(
        `${this.frontendUrl}/oauth/callback?error=${encodeURIComponent(error)}&message=${encodeURIComponent(errorDescription || '')}`,
      );
    }

    // Validate required parameters
    if (!code || code.trim() === '') {
      this.logger.error('Missing authorization code');
      return res?.redirect(`${this.frontendUrl}/oauth/callback?error=missing_code`);
    }

    // Validate state parameter for CSRF protection
    if (!state) {
      this.logger.error('Missing state parameter');
      return res?.redirect(`${this.frontendUrl}/oauth/callback?error=invalid_state`);
    }

    const isValidState = await this.oauthStateService.validateAndConsumeState(state);
    if (!isValidState) {
      this.logger.error('Invalid or expired state parameter');
      return res?.redirect(`${this.frontendUrl}/oauth/callback?error=invalid_state`);
    }

    this.logger.log('Processing OAuth callback with validated state');

    try {
      // Exchange code for tokens
      const tokens = await this.oauthService.exchangeCodeForTokens(code);

      // Get portal ID from the access token
      const tokenInfo = await this.oauthService.getTokenInfo(tokens.accessToken);
      const portalIdNum = tokenInfo.hubId;

      if (!portalIdNum) {
        return res?.redirect(`${this.frontendUrl}/oauth/callback?error=invalid_token`);
      }

      // Save account with encrypted tokens
      const account = await this.oauthService.saveAccount(portalIdNum, tokens);

      // Seed default dormancy rules for new accounts
      try {
        const ruleCount = await this.dormancyRuleRepository.count({ where: { accountId: account.id } });
        if (ruleCount === 0) {
          await this.dormancyRuleRepository.save([
            this.dormancyRuleRepository.create({
              accountId: account.id,
              name: 'Dormant Leads - 30 Days',
              criteria: { min_days_inactive: 30 },
              actionType: ActionType.EMAIL,
              actionConfig: { tone: 'professional' },
            }),
            this.dormancyRuleRepository.create({
              accountId: account.id,
              name: 'Highly Dormant - 90 Days',
              criteria: { min_days_inactive: 90 },
              actionType: ActionType.EMAIL,
              actionConfig: { tone: 'friendly' },
            }),
          ]);
          this.logger.log(`Seeded default dormancy rules for account ${account.id}`);
        }
      } catch (seedError) {
        this.logger.warn(`Failed to seed default rules for account ${account.id}`, seedError);
      }

      this.logger.log(`Successfully connected portal ${portalIdNum} (account: ${account.id})`);

      // Redirect to frontend with success, including account_id (UUID)
      return res?.redirect(
        `${this.frontendUrl}/oauth/callback?success=true&portal_id=${portalIdNum}&account_id=${account.id}`,
      );
    } catch (error) {
      this.logger.error('OAuth callback failed', error);
      return res?.redirect(`${this.frontendUrl}/oauth/callback?error=auth_failed`);
    }
  }

  /**
   * Handle OAuth error callback from HubSpot
   */
  @Get('error')
  async handleError(
    @Query('error') error: string,
    @Query('error_description') errorDescription?: string,
  ): Promise<never> {
    const message = errorDescription || error || 'Unknown OAuth error';
    this.logger.error(`OAuth error: ${error} - ${errorDescription}`);

    throw new UnauthorizedException(`OAuth failed: ${message}`);
  }

  /**
   * Check connection status for a portal
   */
  @Get('status')
  async getStatus(@Query('portal_id') portalId: number): Promise<{
    connected: boolean;
    portalId?: number;
    accountId?: string;
    tokenExpired?: boolean;
    companyName?: string;
  }> {
    const account = await this.oauthService.getAccountByPortalId(portalId);

    if (!account) {
      return { connected: false };
    }

    const tokenExpired = new Date() >= account.tokenExpiresAt;

    return {
      connected: true,
      portalId: account.portalId,
      accountId: account.id,
      tokenExpired,
      companyName: account.companyName,
    };
  }

  /**
   * Disconnect HubSpot account and revoke tokens
   */
  @Post('disconnect')
  async disconnect(@Query('portal_id') portalId: number): Promise<{ success: boolean }> {
    if (!portalId) {
      throw new BadRequestException('Portal ID is required');
    }

    this.logger.log(`Disconnecting portal ${portalId}`);

    const success = await this.oauthService.revokeTokens(portalId);
    return { success };
  }
}
