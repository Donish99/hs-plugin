import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { HubspotAccount } from './hubspot-account.entity';
import { Campaign } from './campaign.entity';
import { MessageVariant } from './message-variant.entity';

/**
 * Outreach status enum
 */
export enum OutreachStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  SENT = 'sent',
  DELIVERED = 'delivered',
  OPENED = 'opened',
  CLICKED = 'clicked',
  REPLIED = 'replied',
  BOUNCED = 'bounced',
  FAILED = 'failed',
}

/**
 * Outreach channel enum
 */
export enum OutreachChannel {
  EMAIL = 'email',
  SMS = 'sms',
}

/**
 * Failed statuses that indicate delivery failure
 */
const FAILED_STATUSES = [OutreachStatus.BOUNCED, OutreachStatus.FAILED];

/**
 * Delivered statuses that indicate successful delivery
 */
const DELIVERED_STATUSES = [
  OutreachStatus.DELIVERED,
  OutreachStatus.OPENED,
  OutreachStatus.CLICKED,
  OutreachStatus.REPLIED,
];

/**
 * OutreachRecord entity - individual outreach attempt to a contact
 */
@Entity('outreach_records')
export class OutreachRecord {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'campaign_id', nullable: true })
  @Index()
  campaignId?: string;

  @ManyToOne(() => Campaign, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'campaign_id' })
  campaign?: Campaign;

  @Column({ type: 'uuid', name: 'account_id' })
  @Index()
  accountId!: string;

  @ManyToOne(() => HubspotAccount, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'account_id' })
  account?: HubspotAccount;

  @Column({ type: 'bigint', name: 'hubspot_contact_id' })
  @Index()
  hubspotContactId!: number;

  @Column({ type: 'bigint', nullable: true, name: 'hubspot_deal_id' })
  hubspotDealId?: number;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'contact_email' })
  contactEmail?: string;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'contact_name' })
  contactName?: string;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'company_name' })
  companyName?: string;

  @Column({ type: 'varchar', length: 50 })
  channel!: OutreachChannel;

  @Column({ type: 'text', nullable: true })
  subject?: string;

  @Column({ type: 'text', nullable: true, name: 'body_text' })
  bodyText?: string;

  @Column({ type: 'text', nullable: true, name: 'body_html' })
  bodyHtml?: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'ai_model' })
  aiModel?: string;

  @Column({ type: 'int', nullable: true, name: 'ai_prompt_tokens' })
  aiPromptTokens?: number;

  @Column({ type: 'int', nullable: true, name: 'ai_completion_tokens' })
  aiCompletionTokens?: number;

  @Column({ type: 'uuid', nullable: true, name: 'variant_id' })
  @Index()
  variantId?: string;

  @ManyToOne(() => MessageVariant, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'variant_id' })
  variant?: MessageVariant;

  @Column({ type: 'uuid', nullable: true, name: 'variant_group_id' })
  @Index()
  variantGroupId?: string;

  @Column({ type: 'int', nullable: true, name: 'selected_variant_index' })
  selectedVariantIndex?: number;

  @Column({
    type: 'varchar',
    length: 50,
    default: OutreachStatus.PENDING,
  })
  status: OutreachStatus = OutreachStatus.PENDING;

  @Column({ type: 'timestamp', nullable: true, name: 'scheduled_at' })
  scheduledAt?: Date;

  @Column({ type: 'timestamp', nullable: true, name: 'sent_at' })
  sentAt?: Date;

  @Column({ type: 'timestamp', nullable: true, name: 'opened_at' })
  openedAt?: Date;

  @Column({ type: 'timestamp', nullable: true, name: 'clicked_at' })
  clickedAt?: Date;

  @Column({ type: 'timestamp', nullable: true, name: 'replied_at' })
  repliedAt?: Date;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'sendgrid_message_id' })
  sendgridMessageId?: string;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'twilio_message_sid' })
  twilioMessageSid?: string;

  @Column({ type: 'bigint', nullable: true, name: 'hubspot_email_id' })
  hubspotEmailId?: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  /**
   * Check if the outreach was delivered successfully
   */
  isDelivered(): boolean {
    return DELIVERED_STATUSES.includes(this.status);
  }

  /**
   * Check if the outreach failed
   */
  isFailed(): boolean {
    return FAILED_STATUSES.includes(this.status);
  }

  /**
   * Check if this is an email outreach
   */
  isEmail(): boolean {
    return this.channel === OutreachChannel.EMAIL;
  }

  /**
   * Check if this is an SMS outreach
   */
  isSms(): boolean {
    return this.channel === OutreachChannel.SMS;
  }

  /**
   * Get total AI tokens used for this outreach
   */
  getTotalTokens(): number {
    return (this.aiPromptTokens || 0) + (this.aiCompletionTokens || 0);
  }

  /**
   * Check if this outreach has variant tracking
   */
  hasVariantTracking(): boolean {
    return !!this.variantId || !!this.variantGroupId;
  }
}
