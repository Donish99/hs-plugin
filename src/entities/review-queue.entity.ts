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
import { MessageVariant } from './message-variant.entity';
import { Campaign } from './campaign.entity';

/**
 * Review status enum
 */
export enum ReviewStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  EDITED = 'edited',
}

/**
 * ReviewQueue entity - messages pending human approval before sending
 */
@Entity('review_queue')
export class ReviewQueue {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'account_id' })
  @Index()
  accountId!: string;

  @ManyToOne(() => HubspotAccount, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'account_id' })
  account?: HubspotAccount;

  @Column({ type: 'uuid', name: 'variant_id' })
  @Index()
  variantId!: string;

  @ManyToOne(() => MessageVariant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'variant_id' })
  variant?: MessageVariant;

  @Column({ type: 'uuid', name: 'campaign_id', nullable: true })
  @Index()
  campaignId?: string;

  @ManyToOne(() => Campaign, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'campaign_id' })
  campaign?: Campaign;

  @Column({ type: 'bigint', name: 'hubspot_contact_id' })
  @Index()
  hubspotContactId!: number;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'contact_name' })
  contactName?: string;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'contact_email' })
  contactEmail?: string;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'company_name' })
  companyName?: string;

  @Column({ type: 'text', name: 'original_subject' })
  originalSubject!: string;

  @Column({ type: 'text', name: 'original_body' })
  originalBody!: string;

  @Column({ type: 'text', nullable: true, name: 'edited_subject' })
  editedSubject?: string;

  @Column({ type: 'text', nullable: true, name: 'edited_body' })
  editedBody?: string;

  @Column({
    type: 'varchar',
    length: 50,
    default: ReviewStatus.PENDING,
  })
  status: ReviewStatus = ReviewStatus.PENDING;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'reviewed_by' })
  reviewedBy?: string;

  @Column({ type: 'timestamp', nullable: true, name: 'reviewed_at' })
  reviewedAt?: Date;

  @Column({ type: 'text', nullable: true, name: 'rejection_reason' })
  rejectionReason?: string;

  @Column({ type: 'boolean', default: false, name: 'auto_approved' })
  autoApproved: boolean = false;

  @Column({ type: 'int', default: 0 })
  priority: number = 0;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  /**
   * Check if the review is pending
   */
  isPending(): boolean {
    return this.status === ReviewStatus.PENDING;
  }

  /**
   * Check if the review was approved
   */
  isApproved(): boolean {
    return this.status === ReviewStatus.APPROVED || this.status === ReviewStatus.EDITED;
  }

  /**
   * Check if the review was rejected
   */
  isRejected(): boolean {
    return this.status === ReviewStatus.REJECTED;
  }

  /**
   * Get the final subject (edited or original)
   */
  getFinalSubject(): string {
    return this.editedSubject || this.originalSubject;
  }

  /**
   * Get the final body (edited or original)
   */
  getFinalBody(): string {
    return this.editedBody || this.originalBody;
  }

  /**
   * Check if the message was edited
   */
  wasEdited(): boolean {
    return (
      this.status === ReviewStatus.EDITED ||
      (!!this.editedSubject && this.editedSubject !== this.originalSubject) ||
      (!!this.editedBody && this.editedBody !== this.originalBody)
    );
  }
}
