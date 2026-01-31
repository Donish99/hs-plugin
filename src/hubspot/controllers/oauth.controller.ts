import {
  Controller,
  Get,
  Query,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { OAuthService } from '../services/oauth.service';

/**
 * Default OAuth scopes required for the plugin
 */
const DEFAULT_SCOPES = [
  'crm.objects.contacts.read',
  'crm.objects.contacts.write',
  'crm.objects.deals.read',
  'crm.objects.companies.read',
  'crm.lists.read',
  'crm.objects.users.read',
  'sales-email-read',
  'automation.sequences.read',
  'oauth',
];

@Controller('api/hubspot/oauth')
export class OAuthController {
  private readonly logger = new Logger(OAuthController.name);

  constructor(private readonly oauthService: OAuthService) {}

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
   * Exchange authorization code for tokens and save the account
   */
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('portal_id') portalId: string,
    @Query('state') state?: string,
  ): Promise<{ success: boolean; portalId: number; message: string }> {
    // Validate required parameters
    if (!code || code.trim() === '') {
      throw new BadRequestException('Authorization code is required');
    }

    if (!portalId || portalId.trim() === '') {
      throw new BadRequestException('Portal ID is required');
    }

    const portalIdNum = parseInt(portalId, 10);
    if (isNaN(portalIdNum)) {
      throw new BadRequestException('Invalid portal ID');
    }

    // TODO: Validate state parameter against stored state for CSRF protection

    this.logger.log(`Processing OAuth callback for portal ${portalIdNum}`);

    try {
      // Exchange code for tokens
      const tokens = await this.oauthService.exchangeCodeForTokens(code);

      // Save account with encrypted tokens
      await this.oauthService.saveAccount(portalIdNum, tokens);

      this.logger.log(`Successfully connected portal ${portalIdNum}`);

      return {
        success: true,
        portalId: portalIdNum,
        message: 'Successfully connected to HubSpot',
      };
    } catch (error) {
      this.logger.error(`OAuth callback failed for portal ${portalIdNum}`, error);
      throw new UnauthorizedException(
        'Failed to authenticate with HubSpot. Please try again.',
      );
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
  async getStatus(
    @Query('portal_id') portalId: number,
  ): Promise<{
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
    return Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15);
  }
}
