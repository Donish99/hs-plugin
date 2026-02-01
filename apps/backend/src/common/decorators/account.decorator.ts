import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';

/**
 * Custom decorator to extract the account UUID from the request.
 * The TokenValidationMiddleware attaches the accountId to the request
 * after looking up the account by portal ID.
 *
 * @example
 * ```ts
 * @Get('overview')
 * async getOverview(@AccountId() accountId: string) {
 *   // accountId is the UUID, not the portal ID
 * }
 * ```
 */
export const AccountId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    const accountId = request.accountId;

    if (!accountId) {
      throw new UnauthorizedException(
        'Account ID not found. Ensure TokenValidationMiddleware is applied.',
      );
    }

    return accountId;
  },
);

/**
 * Custom decorator to extract the portal ID from the request.
 *
 * @example
 * ```ts
 * @Get('hubspot-link')
 * async getLink(@PortalId() portalId: number) {
 *   // portalId is the HubSpot portal ID (numeric)
 * }
 * ```
 */
export const PortalId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): number => {
    const request = ctx.switchToHttp().getRequest();
    const portalId = request.portalId;

    if (!portalId) {
      throw new UnauthorizedException(
        'Portal ID not found. Ensure TokenValidationMiddleware is applied.',
      );
    }

    return portalId;
  },
);
