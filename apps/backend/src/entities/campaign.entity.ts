import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { HubspotAccount } from './hubspot-account.entity';
import { DormancyRule } from './dormancy-rule.entity';

/**
 * Campaign status enum
 */
export enum CampaignStatus {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  RUNNING = 'running',
  COMPLETED = 'completed',
  PAUSED = 'paused',
}

/**
 * Valid status transitions
 */
const STATUS_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  [CampaignStatus.DRAFT]: [CampaignStatus.SCHEDULED, CampaignStatus.RUNNING],
  [CampaignStatus.SCHEDULED]: [CampaignStatus.RUNNING, CampaignStatus.PAUSED, CampaignStatus.DRAFT],
  [CampaignStatus.RUNNING]: [CampaignStatus.COMPLETED, CampaignStatus.PAUSED],
  [CampaignStatus.PAUSED]: [CampaignStatus.RUNNING, CampaignStatus.COMPLETED],
  [CampaignStatus.COMPLETED]: [],
};

/**
 * Campaign entity - represents a batch reactivation campaign
 */
@Entity('campaigns')
export class Campaign {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'account_id' })
  @Index()
  accountId!: string;

  @ManyToOne(() => HubspotAccount, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'account_id' })
  account?: HubspotAccount;

  @Column({ type: 'uuid', name: 'rule_id', nullable: true })
  ruleId?: string;

  @ManyToOne(() => DormancyRule, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'rule_id' })
  rule?: DormancyRule;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name?: string;

  @Column({
    type: 'varchar',
    length: 50,
    default: CampaignStatus.DRAFT,
  })
  status: CampaignStatus = CampaignStatus.DRAFT;

  @Column({ type: 'int', default: 0, name: 'total_contacts' })
  totalContacts: number = 0;

  @Column({ type: 'int', default: 0, name: 'emails_sent' })
  emailsSent: number = 0;

  @Column({ type: 'int', default: 0, name: 'emails_opened' })
  emailsOpened: number = 0;

  @Column({ type: 'int', default: 0, name: 'emails_replied' })
  emailsReplied: number = 0;

  @Column({ type: 'int', default: 0, name: 'meetings_booked' })
  meetingsBooked: number = 0;

  @Column({ type: 'timestamp', nullable: true, name: 'scheduled_at' })
  scheduledAt?: Date;

  @Column({ type: 'timestamp', nullable: true, name: 'started_at' })
  startedAt?: Date;

  @Column({ type: 'timestamp', nullable: true, name: 'completed_at' })
  completedAt?: Date;

  @Column({ type: 'boolean', default: false, name: 'requires_review' })
  requiresReview: boolean = false;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  /**
   * Check if the campaign can transition to a new status
   */
  canTransitionTo(newStatus: CampaignStatus): boolean {
    const allowedTransitions = STATUS_TRANSITIONS[this.status];
    return allowedTransitions.includes(newStatus);
  }

  /**
   * Calculate open rate as a percentage
   */
  getOpenRate(): number {
    if (this.emailsSent === 0) return 0;
    return Math.round((this.emailsOpened / this.emailsSent) * 100);
  }

  /**
   * Calculate reply rate as a percentage
   */
  getReplyRate(): number {
    if (this.emailsSent === 0) return 0;
    return Math.round((this.emailsReplied / this.emailsSent) * 100);
  }

  /**
   * Calculate click-through rate (would need clicks column)
   */
  getClickRate(): number {
    if (this.emailsSent === 0) return 0;
    // Note: Would need emailsClicked column
    return 0;
  }
}
