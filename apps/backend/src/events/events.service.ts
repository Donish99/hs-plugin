import { Injectable, Logger } from '@nestjs/common';
import { Response } from 'express';
import { CampaignEvent, CampaignEventType, createCampaignEvent } from './campaign-events';

/**
 * Subscriber information for SSE connections
 */
interface Subscriber {
  response: Response;
  accountId: string;
  campaignId: string;
  connectedAt: Date;
}

/**
 * Service for managing Server-Sent Events (SSE) for campaign updates
 */
@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  /**
   * Map of campaignId to Set of subscribers
   */
  private subscribers = new Map<string, Set<Subscriber>>();

  /**
   * Subscribe a client to campaign events
   */
  subscribeToCampaign(
    campaignId: string,
    accountId: string,
    response: Response,
  ): void {
    const subscriber: Subscriber = {
      response,
      accountId,
      campaignId,
      connectedAt: new Date(),
    };

    if (!this.subscribers.has(campaignId)) {
      this.subscribers.set(campaignId, new Set());
    }

    this.subscribers.get(campaignId)!.add(subscriber);

    this.logger.log(
      `Client subscribed to campaign ${campaignId} (${this.getSubscriberCount(campaignId)} total subscribers)`,
    );

    // Set up cleanup on connection close
    response.on('close', () => {
      this.unsubscribe(campaignId, subscriber);
    });
  }

  /**
   * Unsubscribe a client from campaign events
   */
  unsubscribe(campaignId: string, subscriber: Subscriber): void {
    const subscribers = this.subscribers.get(campaignId);
    if (subscribers) {
      subscribers.delete(subscriber);
      this.logger.log(
        `Client unsubscribed from campaign ${campaignId} (${this.getSubscriberCount(campaignId)} remaining subscribers)`,
      );

      // Clean up empty sets
      if (subscribers.size === 0) {
        this.subscribers.delete(campaignId);
      }
    }
  }

  /**
   * Emit an event to all subscribers of a campaign
   */
  emitEvent(campaignId: string, event: CampaignEvent): void {
    const subscribers = this.subscribers.get(campaignId);
    if (!subscribers || subscribers.size === 0) {
      return;
    }

    const eventData = JSON.stringify(event);
    const message = `event: ${event.type}\ndata: ${eventData}\n\n`;

    let sentCount = 0;
    const failedSubscribers: Subscriber[] = [];

    for (const subscriber of subscribers) {
      try {
        subscriber.response.write(message);
        sentCount++;
      } catch (error) {
        this.logger.warn(
          `Failed to send event to subscriber: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        failedSubscribers.push(subscriber);
      }
    }

    // Clean up failed subscribers
    for (const subscriber of failedSubscribers) {
      subscribers.delete(subscriber);
    }

    this.logger.debug(
      `Emitted ${event.type} event to ${sentCount} subscribers for campaign ${campaignId}`,
    );
  }

  /**
   * Emit a message generating event
   */
  emitMessageGenerating(
    campaignId: string,
    data: {
      outreachRecordId: string;
      contactEmail?: string;
      contactName?: string;
    },
  ): void {
    const event = createCampaignEvent(
      CampaignEventType.MESSAGE_GENERATING,
      campaignId,
      data,
    );
    this.emitEvent(campaignId, event);
  }

  /**
   * Emit a message generated event
   */
  emitMessageGenerated(
    campaignId: string,
    data: {
      outreachRecordId: string;
      contactEmail?: string;
      contactName?: string;
      subject?: string;
      tokensUsed?: number;
    },
  ): void {
    const event = createCampaignEvent(
      CampaignEventType.MESSAGE_GENERATED,
      campaignId,
      data,
    );
    this.emitEvent(campaignId, event);
  }

  /**
   * Emit a message sent event
   */
  emitMessageSent(
    campaignId: string,
    data: {
      outreachRecordId: string;
      contactEmail?: string;
      contactName?: string;
      channel: 'email' | 'sms';
      messageId?: string;
      sentAt: string;
    },
  ): void {
    const event = createCampaignEvent(
      CampaignEventType.MESSAGE_SENT,
      campaignId,
      data,
    );
    this.emitEvent(campaignId, event);
  }

  /**
   * Emit a message failed event
   */
  emitMessageFailed(
    campaignId: string,
    data: {
      outreachRecordId: string;
      contactEmail?: string;
      contactName?: string;
      channel: 'email' | 'sms';
      error: string;
    },
  ): void {
    const event = createCampaignEvent(
      CampaignEventType.MESSAGE_FAILED,
      campaignId,
      data,
    );
    this.emitEvent(campaignId, event);
  }

  /**
   * Emit a progress update event
   */
  emitProgressUpdate(
    campaignId: string,
    data: {
      total: number;
      pending: number;
      sent: number;
      failed: number;
      generating: number;
      percentComplete: number;
    },
  ): void {
    const event = createCampaignEvent(
      CampaignEventType.PROGRESS_UPDATE,
      campaignId,
      data,
    );
    this.emitEvent(campaignId, event);
  }

  /**
   * Emit a campaign completed event
   */
  emitCampaignCompleted(
    campaignId: string,
    data: {
      total: number;
      sent: number;
      failed: number;
      completedAt: string;
    },
  ): void {
    const event = createCampaignEvent(
      CampaignEventType.CAMPAIGN_COMPLETED,
      campaignId,
      data,
    );
    this.emitEvent(campaignId, event);
  }

  /**
   * Emit a campaign paused event
   */
  emitCampaignPaused(campaignId: string): void {
    const event = createCampaignEvent(CampaignEventType.CAMPAIGN_PAUSED, campaignId, {
      pausedAt: new Date().toISOString(),
    });
    this.emitEvent(campaignId, event);
  }

  /**
   * Get the number of subscribers for a campaign
   */
  getSubscriberCount(campaignId: string): number {
    return this.subscribers.get(campaignId)?.size || 0;
  }

  /**
   * Check if a campaign has any active subscribers
   */
  hasSubscribers(campaignId: string): boolean {
    return this.getSubscriberCount(campaignId) > 0;
  }
}
