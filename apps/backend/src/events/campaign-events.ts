/**
 * Campaign event types for Server-Sent Events
 */

export enum CampaignEventType {
  /** AI message generation started */
  MESSAGE_GENERATING = 'message_generating',
  /** AI message generation completed */
  MESSAGE_GENERATED = 'message_generated',
  /** Message sent successfully */
  MESSAGE_SENT = 'message_sent',
  /** Message send failed */
  MESSAGE_FAILED = 'message_failed',
  /** Progress update (periodic summary) */
  PROGRESS_UPDATE = 'progress_update',
  /** Campaign completed (all messages processed) */
  CAMPAIGN_COMPLETED = 'campaign_completed',
  /** Campaign paused */
  CAMPAIGN_PAUSED = 'campaign_paused',
}

/**
 * Base campaign event structure
 */
export interface BaseCampaignEvent {
  type: CampaignEventType;
  campaignId: string;
  timestamp: string;
}

/**
 * Message generating event - AI generation started
 */
export interface MessageGeneratingEvent extends BaseCampaignEvent {
  type: CampaignEventType.MESSAGE_GENERATING;
  data: {
    outreachRecordId: string;
    contactEmail?: string;
    contactName?: string;
  };
}

/**
 * Message generated event - AI content ready
 */
export interface MessageGeneratedEvent extends BaseCampaignEvent {
  type: CampaignEventType.MESSAGE_GENERATED;
  data: {
    outreachRecordId: string;
    contactEmail?: string;
    contactName?: string;
    subject?: string;
    tokensUsed?: number;
  };
}

/**
 * Message sent event - successful delivery
 */
export interface MessageSentEvent extends BaseCampaignEvent {
  type: CampaignEventType.MESSAGE_SENT;
  data: {
    outreachRecordId: string;
    contactEmail?: string;
    contactName?: string;
    channel: 'email' | 'sms';
    messageId?: string;
    sentAt: string;
  };
}

/**
 * Message failed event - delivery failed
 */
export interface MessageFailedEvent extends BaseCampaignEvent {
  type: CampaignEventType.MESSAGE_FAILED;
  data: {
    outreachRecordId: string;
    contactEmail?: string;
    contactName?: string;
    channel: 'email' | 'sms';
    error: string;
  };
}

/**
 * Progress update event - periodic summary
 */
export interface ProgressUpdateEvent extends BaseCampaignEvent {
  type: CampaignEventType.PROGRESS_UPDATE;
  data: {
    total: number;
    pending: number;
    sent: number;
    failed: number;
    generating: number;
    percentComplete: number;
  };
}

/**
 * Campaign completed event
 */
export interface CampaignCompletedEvent extends BaseCampaignEvent {
  type: CampaignEventType.CAMPAIGN_COMPLETED;
  data: {
    total: number;
    sent: number;
    failed: number;
    completedAt: string;
  };
}

/**
 * Campaign paused event
 */
export interface CampaignPausedEvent extends BaseCampaignEvent {
  type: CampaignEventType.CAMPAIGN_PAUSED;
  data: {
    pausedAt: string;
  };
}

/**
 * Union type for all campaign events
 */
export type CampaignEvent =
  | MessageGeneratingEvent
  | MessageGeneratedEvent
  | MessageSentEvent
  | MessageFailedEvent
  | ProgressUpdateEvent
  | CampaignCompletedEvent
  | CampaignPausedEvent;

/**
 * Create a campaign event with common fields
 */
export function createCampaignEvent<T extends CampaignEventType>(
  type: T,
  campaignId: string,
  data: Extract<CampaignEvent, { type: T }>['data'],
): Extract<CampaignEvent, { type: T }> {
  return {
    type,
    campaignId,
    timestamp: new Date().toISOString(),
    data,
  } as Extract<CampaignEvent, { type: T }>;
}
