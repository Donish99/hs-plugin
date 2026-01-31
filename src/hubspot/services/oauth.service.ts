import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { Client } from '@hubspot/api-client';
import { HubspotAccount } from '../../entities/hubspot-account.entity';

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AccountWithTokens {
  id: string;
  portalId: number;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
  companyName?: string;
}

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly encryptionKey: Buffer;
  private readonly algorithm = 'aes-256-gcm';

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(HubspotAccount)
    private readonly accountRepository: Repository<HubspotAccount>,
  ) {
    this.clientId = this.configService.getOrThrow<string>('HUBSPOT_CLIENT_ID');
    this.clientSecret = this.configService.getOrThrow<string>('HUBSPOT_CLIENT_SECRET');
    const appUrl = this.configService.getOrThrow<string>('APP_URL');
    this.redirectUri = `${appUrl}/api/hubspot/oauth/callback`;

    // Derive a 32-byte key from the encryption key
    const rawKey = this.configService.getOrThrow<string>('ENCRYPTION_KEY');
    this.encryptionKey = crypto.scryptSync(rawKey, 'salt', 32);
  }

  /**
   * Generate HubSpot OAuth authorization URL
   */
  getAuthorizationUrl(scopes: string[], state?: string): string {
    const generatedState = state || crypto.randomBytes(16).toString('hex');

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: scopes.join(' '),
      state: generatedState,
    });

    return `https://app.hubspot.com/oauth/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access and refresh tokens
   */
  async exchangeCodeForTokens(code: string): Promise<TokenResponse> {
    if (!code || code.trim() === '') {
      throw new Error('Authorization code is required');
    }

    return this.exchangeWithHubspot(code);
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
    if (!refreshToken || refreshToken.trim() === '') {
      throw new Error('Refresh token is required');
    }

    return this.refreshWithHubspot(refreshToken);
  }

  /**
   * Encrypt a token for secure storage
   */
  encryptToken(plainText: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);

    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:encryptedData
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt a stored token
   */
  decryptToken(encryptedText: string): string {
    try {
      const parts = encryptedText.split(':');
      if (parts.length !== 3) {
        throw new Error('Invalid encrypted data format');
      }

      const [ivHex, authTagHex, encrypted] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');

      const decipher = crypto.createDecipheriv(this.algorithm, this.encryptionKey, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      this.logger.error('Failed to decrypt token', error);
      throw new Error('Failed to decrypt token');
    }
  }

  /**
   * Save or update HubSpot account with encrypted tokens
   */
  async saveAccount(
    portalId: number,
    tokens: TokenResponse,
    companyName?: string,
  ): Promise<HubspotAccount> {
    let account = await this.accountRepository.findOne({
      where: { portalId },
    });

    const encryptedAccessToken = this.encryptToken(tokens.accessToken);
    const encryptedRefreshToken = this.encryptToken(tokens.refreshToken);
    const tokenExpiresAt = new Date(Date.now() + tokens.expiresIn * 1000);

    if (!account) {
      account = this.accountRepository.create({
        portalId,
        accessTokenEncrypted: encryptedAccessToken,
        refreshTokenEncrypted: encryptedRefreshToken,
        tokenExpiresAt,
        companyName,
      });
    } else {
      account.accessTokenEncrypted = encryptedAccessToken;
      account.refreshTokenEncrypted = encryptedRefreshToken;
      account.tokenExpiresAt = tokenExpiresAt;
      if (companyName) {
        account.companyName = companyName;
      }
    }

    return this.accountRepository.save(account);
  }

  /**
   * Get account by portal ID with decrypted tokens
   */
  async getAccountByPortalId(portalId: number): Promise<AccountWithTokens | null> {
    const account = await this.accountRepository.findOne({
      where: { portalId },
    });

    if (!account) {
      return null;
    }

    return {
      id: account.id,
      portalId: account.portalId,
      accessToken: this.decryptToken(account.accessTokenEncrypted),
      refreshToken: this.decryptToken(account.refreshTokenEncrypted),
      tokenExpiresAt: account.tokenExpiresAt,
      companyName: account.companyName,
    };
  }

  /**
   * Get a valid access token, refreshing if necessary
   */
  async getValidAccessToken(portalId: number): Promise<string> {
    const account = await this.accountRepository.findOne({
      where: { portalId },
    });

    if (!account) {
      throw new Error('Account not found');
    }

    // Check if token is expiring soon (within 1 minute)
    const isExpiringSoon =
      typeof account.isTokenExpiringSoon === 'function'
        ? account.isTokenExpiringSoon()
        : new Date() >= new Date(account.tokenExpiresAt.getTime() - 60000);

    if (isExpiringSoon) {
      this.logger.log(`Token expiring soon for portal ${portalId}, refreshing...`);

      const refreshToken = this.decryptToken(account.refreshTokenEncrypted);
      const newTokens = await this.refreshAccessToken(refreshToken);

      await this.saveAccount(portalId, newTokens);

      return newTokens.accessToken;
    }

    return this.decryptToken(account.accessTokenEncrypted);
  }

  /**
   * Internal method to exchange code with HubSpot API
   */
  private async exchangeWithHubspot(code: string): Promise<TokenResponse> {
    const hubspotClient = new Client();

    try {
      const result = await hubspotClient.oauth.tokensApi.create(
        'authorization_code',
        code,
        this.redirectUri,
        this.clientId,
        this.clientSecret,
      );

      return {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn,
      };
    } catch (error) {
      this.logger.error('Failed to exchange code for tokens', error);
      throw error;
    }
  }

  /**
   * Internal method to refresh tokens with HubSpot API
   */
  private async refreshWithHubspot(refreshToken: string): Promise<TokenResponse> {
    const hubspotClient = new Client();

    try {
      const result = await hubspotClient.oauth.tokensApi.create(
        'refresh_token',
        undefined,
        this.redirectUri,
        this.clientId,
        this.clientSecret,
        refreshToken,
      );

      return {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn,
      };
    } catch (error) {
      this.logger.error('Failed to refresh tokens', error);
      throw error;
    }
  }

  /**
   * Get access token for a portal (alias for getValidAccessToken)
   */
  async getAccessToken(portalId: number): Promise<string | null> {
    try {
      return await this.getValidAccessToken(portalId);
    } catch {
      return null;
    }
  }

  /**
   * Get the HubSpot plan for an account
   */
  async getAccountPlan(portalId: number): Promise<string | null> {
    const account = await this.accountRepository.findOne({
      where: { portalId },
    });

    return account?.plan || null;
  }
}
