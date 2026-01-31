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

/**
 * Action types for dormancy rules
 */
export enum ActionType {
  EMAIL = 'email',
  SMS = 'sms',
  SEQUENCE = 'sequence',
  TASK = 'task',
}

/**
 * Dormancy criteria structure
 */
export interface DormancyCriteria {
  min_days_inactive?: number;
  no_email_opens_days?: number;
  no_email_clicks_days?: number;
  no_website_visits_days?: number;
  deal_stages?: string[];
  exclude_tags?: string[];
  min_lead_score?: number;
}

/**
 * Action configuration structure
 */
export interface ActionConfig {
  template?: string;
  tone?: string;
  sequenceId?: string;
  taskOwnerId?: string;
  [key: string]: unknown;
}

/**
 * Dormancy Rule entity - defines criteria for identifying dormant leads
 */
@Entity('dormancy_rules')
export class DormancyRule {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'account_id' })
  @Index()
  accountId!: string;

  @ManyToOne(() => HubspotAccount, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'account_id' })
  account?: HubspotAccount;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'boolean', default: true, name: 'is_active' })
  isActive: boolean = true;

  @Column({ type: 'jsonb' })
  criteria!: DormancyCriteria;

  @Column({
    type: 'varchar',
    length: 50,
    name: 'action_type',
  })
  actionType!: ActionType;

  @Column({ type: 'jsonb', name: 'action_config' })
  actionConfig!: ActionConfig;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
