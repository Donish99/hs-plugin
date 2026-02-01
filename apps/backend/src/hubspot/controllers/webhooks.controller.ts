import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  Req,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { WebhooksService } from '../services/webhooks.service';

interface WebhookResponse {
  received: boolean;
  queued: number;
}

interface WebhookInfoResponse {
  endpointUrl: string;
  subscriptions: string[];
  signatureVersion: string;
}

/**
 * Controller for handling HubSpot webhook requests
 */
@Controller('api/hubspot/webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(private readonly webhooksService: WebhooksService) {}

  /**
   * Handle incoming webhook from HubSpot
   * Must respond within 1 second
   */
  @Post()
  async handleWebhook(
    @Body() body: string,
    @Headers('x-hubspot-signature-v3') signature: string,
    @Headers('x-hubspot-request-timestamp') timestamp: string,
    @Req() req: Request,
  ): Promise<WebhookResponse> {
    const startTime = Date.now();

    try {
      // Get raw body for signature validation
      const rawBody = typeof body === 'string' ? body : JSON.stringify(body);

      // Build URL for signature validation
      const host = req.get?.('host') || req.headers?.['host'] || 'localhost';
      const protocol = req.protocol || 'https';
      const url = `${protocol}://${host}${req.originalUrl || req.url}`;

      // Validate signature
      const validationResult = this.webhooksService.validateSignature({
        signature: signature || '',
        timestamp: timestamp || '',
        method: req.method,
        url,
        body: rawBody,
      });

      if (!validationResult.valid) {
        this.logger.warn(
          `Webhook validation failed: ${validationResult.reason}`,
        );
        throw new HttpException(
          validationResult.reason || 'Invalid request',
          HttpStatus.UNAUTHORIZED,
        );
      }

      // Parse events from payload
      const events = this.webhooksService.parseWebhookPayload(rawBody);

      // Deduplicate events
      const uniqueEvents = this.webhooksService.deduplicateEvents(events);

      // Queue events for async processing
      const queueResult = await this.webhooksService.queueEvents(uniqueEvents);

      const elapsed = Date.now() - startTime;
      this.logger.log(
        `Webhook processed in ${elapsed}ms: ${queueResult.queued} events queued`,
      );

      return {
        received: true,
        queued: queueResult.queued,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Webhook processing failed: ${errorMessage}`);

      throw new HttpException(
        `Webhook processing failed: ${errorMessage}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Get webhook configuration info (for setup/debugging)
   */
  @Get('info')
  getWebhookInfo(): WebhookInfoResponse {
    return {
      endpointUrl: this.webhooksService.getWebhookEndpointUrl(),
      subscriptions: this.webhooksService.getSupportedSubscriptions(),
      signatureVersion: 'v3',
    };
  }
}
