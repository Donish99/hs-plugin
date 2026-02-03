import { Controller, Get, Param, Res, Req, Logger } from '@nestjs/common';
import { Response, Request } from 'express';
import { EventsService } from './events.service';
import { AccountId } from '../common/decorators/account.decorator';

@Controller('api/accounts/:accountId/campaigns')
export class EventsController {
  private readonly logger = new Logger(EventsController.name);

  constructor(private readonly eventsService: EventsService) {}

  /**
   * GET /api/accounts/:accountId/campaigns/:campaignId/events
   * SSE endpoint for real-time campaign updates
   */
  @Get(':campaignId/events')
  subscribeToCampaignEvents(
    @AccountId() accountId: string,
    @Param('campaignId') campaignId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): void {
    this.logger.log(`SSE connection request for campaign ${campaignId}`);

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Send initial connection confirmation
    const connectionEvent = JSON.stringify({
      type: 'connected',
      campaignId,
      timestamp: new Date().toISOString(),
    });
    res.write(`event: connected\ndata: ${connectionEvent}\n\n`);

    // Subscribe to campaign events
    this.eventsService.subscribeToCampaign(campaignId, accountId, res);

    // Handle client disconnect
    req.on('close', () => {
      this.logger.log(`SSE connection closed for campaign ${campaignId}`);
    });

    // Keep connection alive with heartbeat every 30 seconds
    const heartbeatInterval = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        clearInterval(heartbeatInterval);
      }
    }, 30000);

    // Clean up heartbeat on close
    res.on('close', () => {
      clearInterval(heartbeatInterval);
    });
  }
}
