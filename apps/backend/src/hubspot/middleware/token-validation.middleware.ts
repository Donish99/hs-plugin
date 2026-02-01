import { Injectable, NestMiddleware, UnauthorizedException, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { OAuthService } from '../services/oauth.service';

// Extend Express Request to include our custom properties
declare global {
  namespace Express {
    interface Request {
      portalId?: number;
      accountId?: string; // UUID of the HubspotAccount
      accessToken?: string;
    }
  }
}

const TOKEN_EXPIRY_BUFFER_MS = 60000; // 1 minute

@Injectable()
export class TokenValidationMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TokenValidationMiddleware.name);

  constructor(private readonly oauthService: OAuthService) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const portalId = this.extractPortalId(req);

    if (!portalId) {
      throw new UnauthorizedException('Portal ID is required');
    }

    const portalIdNum = parseInt(portalId, 10);
    if (isNaN(portalIdNum)) {
      throw new UnauthorizedException('Invalid portal ID');
    }

    try {
      const account = await this.oauthService.getAccountByPortalId(portalIdNum);

      if (!account) {
        throw new UnauthorizedException('Account not found');
      }

      // Check if token is expiring soon and refresh if needed
      const tokenExpiresAt = new Date(account.tokenExpiresAt);
      const isExpiringSoon = Date.now() >= tokenExpiresAt.getTime() - TOKEN_EXPIRY_BUFFER_MS;

      let accessToken = account.accessToken;

      if (isExpiringSoon) {
        this.logger.log(`Token expiring soon for portal ${portalIdNum}, refreshing...`);
        accessToken = await this.oauthService.getValidAccessToken(portalIdNum);
      }

      // Attach to request for downstream use
      req.portalId = portalIdNum;
      req.accountId = account.id; // UUID for database queries
      req.accessToken = accessToken;

      next();
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error(`Token validation failed for portal ${portalIdNum}`, error);
      throw new UnauthorizedException('Authentication failed');
    }
  }

  /**
   * Extract portal ID from request (header, query, or params)
   */
  private extractPortalId(req: Request): string | undefined {
    // Priority: header > query > params
    return (
      (req.headers['x-portal-id'] as string) ||
      (req.query['portal_id'] as string) ||
      (req.params['portalId'] as string)
    );
  }
}
