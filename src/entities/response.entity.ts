import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { OutreachRecord } from './outreach-record.entity';

/**
 * Response type enum
 */
export enum ResponseType {
  EMAIL_REPLY = 'email_reply',
  MEETING_BOOKED = 'meeting_booked',
  PHONE_CALL = 'phone_call',
}

/**
 * Response sentiment enum
 */
export enum ResponseSentiment {
  POSITIVE = 'positive',
  NEUTRAL = 'neutral',
  NEGATIVE = 'negative',
}

/**
 * Response intent enum (AI classification)
 */
export enum ResponseIntent {
  INTERESTED = 'interested',
  NOT_NOW = 'not_now',
  NOT_INTERESTED = 'not_interested',
  UNSUBSCRIBE = 'unsubscribe',
  OUT_OF_OFFICE = 'out_of_office',
  BOUNCED = 'bounced',
}

/**
 * Intents that should stop outreach
 */
const STOP_OUTREACH_INTENTS = [ResponseIntent.NOT_INTERESTED, ResponseIntent.UNSUBSCRIBE];

/**
 * Response entity - tracks responses to outreach attempts
 */
@Entity('responses')
export class Response {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'outreach_id' })
  @Index()
  outreachId!: string;

  @ManyToOne(() => OutreachRecord, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'outreach_id' })
  outreach?: OutreachRecord;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'response_type' })
  responseType?: ResponseType;

  @Column({ type: 'varchar', length: 50, nullable: true })
  sentiment?: ResponseSentiment;

  @Column({ type: 'varchar', length: 50, nullable: true })
  intent?: ResponseIntent;

  @Column({ type: 'text', nullable: true })
  content?: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'action_taken' })
  actionTaken?: string;

  @Column({ type: 'bigint', nullable: true, name: 'task_created_id' })
  taskCreatedId?: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  /**
   * Check if the response is positive (interested)
   */
  isPositive(): boolean {
    return this.sentiment === ResponseSentiment.POSITIVE;
  }

  /**
   * Check if the response requires follow-up action
   */
  requiresFollowUp(): boolean {
    return this.intent === ResponseIntent.INTERESTED;
  }

  /**
   * Check if outreach should be stopped based on this response
   */
  shouldStopOutreach(): boolean {
    if (!this.intent) return false;
    return STOP_OUTREACH_INTENTS.includes(this.intent);
  }

  /**
   * Check if the contact should be deferred (not now)
   */
  shouldDefer(): boolean {
    return this.intent === ResponseIntent.NOT_NOW;
  }

  /**
   * Check if the contact requires unsubscribe action
   */
  requiresUnsubscribe(): boolean {
    return this.intent === ResponseIntent.UNSUBSCRIBE;
  }
}
