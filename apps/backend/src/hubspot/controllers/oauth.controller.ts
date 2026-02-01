import {
  Controller,
  Get,
  Query,
  Res,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { OAuthService } from '../services/oauth.service';

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
    private readonly configService: ConfigService,
  ) {
    this.frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';
  }

  /**
   * Initiate HubSpot OAuth flow
   * Returns the authorization URL for the client to redirect to
   */
  @Get('install')
  install(): { url: string } {
    const state = this.generateState();
    const url = this.oauthService.getAuthorizationUrl(DEFAULT_SCOPES, state);

    this.logger.log('Generated OAuth authorization URL');

    return { url };
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
    this.logger.log(`OAuth callback received - code: ${code ? 'yes' : 'no'}, error: ${error || 'none'}`);

    // Handle HubSpot error response
    if (error) {
      this.logger.error(`HubSpot OAuth error: ${error} - ${errorDescription}`);
      return res?.redirect(`${this.frontendUrl}/oauth/callback?error=${encodeURIComponent(error)}&message=${encodeURIComponent(errorDescription || '')}`);
    }

    // Validate required parameters
    if (!code || code.trim() === '') {
      this.logger.error('Missing authorization code');
      return res?.redirect(`${this.frontendUrl}/oauth/callback?error=missing_code`);
    }

    // TODO: Validate state parameter against stored state for CSRF protection

    this.logger.log('Processing OAuth callback');

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
      await this.oauthService.saveAccount(portalIdNum, tokens);

      this.logger.log(`Successfully connected portal ${portalIdNum}`);

      // Redirect to frontend with success
      return res?.redirect(`${this.frontendUrl}/oauth/callback?success=true&portal_id=${portalIdNum}`);
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
      tokenExpired,
      companyName: account.companyName,
    };
  }

  /**
   * Generate a random state string for CSRF protection
   */
  private generateState(): string {
    return (
      Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
    );
  }
}
