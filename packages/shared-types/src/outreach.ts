/**
 * Outreach-related types
 */

export type OutreachStatus =
  | 'pending'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'replied'
  | 'bounced'
  | 'failed';

export type OutreachChannel = 'email' | 'sms';

export interface OutreachRecord {
  id: string;
  campaignId: string;
  hubspotContactId: string;
  channel: OutreachChannel;
  status: OutreachStatus;
  messageContent: string;
  subject?: string;
  sentAt?: Date;
  deliveredAt?: Date;
  openedAt?: Date;
  clickedAt?: Date;
  repliedAt?: Date;
  bouncedAt?: Date;
  failureReason?: string;
  externalMessageId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageVariant {
  id: string;
  campaignId: string;
  channel: OutreachChannel;
  subject?: string;
  content: string;
  tone: string;
  generatedAt: Date;
  isApproved: boolean;
  approvedAt?: Date;
  approvedBy?: string;
}

export interface ReviewQueueItem {
  id: string;
  messageVariantId: string;
  campaignId: string;
  status: 'pending' | 'approved' | 'rejected' | 'edited';
  reviewedAt?: Date;
  reviewedBy?: string;
  editedContent?: string;
  rejectionReason?: string;
}
