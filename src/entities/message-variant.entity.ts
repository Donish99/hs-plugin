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
 * Message variant tone types
 */
export type VariantTone = 'professional' | 'casual' | 'curious';

/**
 * MessageVariant entity - stores AI-generated message variants for A/B testing
 */
@Entity('message_variants')
export class MessageVariant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'account_id' })
  @Index()
  accountId!: string;

  @ManyToOne(() => HubspotAccount, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'account_id' })
  account?: HubspotAccount;

  @Column({ type: 'bigint', name: 'hubspot_contact_id' })
  @Index()
  hubspotContactId!: number;

  @Column({ type: 'uuid', name: 'variant_group_id' })
  @Index()
  variantGroupId!: string;

  @Column({ type: 'int', name: 'variant_index' })
  variantIndex!: number;

  @Column({ type: 'varchar', length: 50 })
  tone!: VariantTone;

  @Column({ type: 'text' })
  subject!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'ai_model' })
  aiModel?: string;

  @Column({ type: 'int', nullable: true, name: 'prompt_tokens' })
  promptTokens?: number;

  @Column({ type: 'int', nullable: true, name: 'completion_tokens' })
  completionTokens?: number;

  @Column({ type: 'boolean', default: false, name: 'is_selected' })
  isSelected: boolean = false;

  @Column({ type: 'boolean', default: false, name: 'is_sent' })
  isSent: boolean = false;

  @Column({ type: 'jsonb', nullable: true, name: 'context_snapshot' })
  contextSnapshot?: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  /**
   * Get total tokens used for this variant
   */
  getTotalTokens(): number {
    return (this.promptTokens || 0) + (this.completionTokens || 0);
  }

  /**
   * Check if this variant was used
   */
  wasUsed(): boolean {
    return this.isSelected || this.isSent;
  }
}
