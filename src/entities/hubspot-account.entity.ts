import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';

/**
 * Account subscription plans
 */
export enum AccountPlan {
  FREE = 'free',
  STARTER = 'starter',
  PROFESSIONAL = 'professional',
  ENTERPRISE = 'enterprise',
}

/**
 * Settings structure for account configuration
 */
export interface AccountSettings {
  timezone?: string;
  businessHoursOnly?: boolean;
  autoApprove?: boolean;
  defaultTone?: string;
  notificationEmail?: string;
}

/**
 * HubSpot Account entity - represents an installed HubSpot portal
 * Multi-tenant: each row is a separate customer installation
 */
@Entity('hubspot_accounts')
export class HubspotAccount {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'bigint', unique: true, name: 'portal_id' })
  @Index()
  portalId!: number;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'company_name' })
  companyName?: string;

  @Column({ type: 'text', name: 'access_token_encrypted' })
  accessTokenEncrypted!: string;

  @Column({ type: 'text', name: 'refresh_token_encrypted' })
  refreshTokenEncrypted!: string;

  @Column({ type: 'timestamp', name: 'token_expires_at' })
  tokenExpiresAt!: Date;

  @Column({ type: 'jsonb', default: '{}' })
  settings: AccountSettings = {};

  @Column({
    type: 'varchar',
    length: 50,
    default: AccountPlan.FREE,
  })
  plan: AccountPlan = AccountPlan.FREE;

  @Column({ type: 'int', default: 100, name: 'monthly_email_limit' })
  monthlyEmailLimit: number = 100;

  @Column({ type: 'int', default: 0, name: 'emails_sent_this_month' })
  emailsSentThisMonth: number = 0;

  @Column({ type: 'boolean', default: true, name: 'is_active' })
  isActive: boolean = true;

  @Column({ type: 'timestamp', nullable: true, name: 'last_synced_at' })
  lastSyncedAt?: Date;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'sync_status' })
  syncStatus?: 'pending' | 'syncing' | 'completed' | 'failed';

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  /**
   * Check if the account has reached its monthly email limit
   */
  isAtEmailLimit(): boolean {
    return this.emailsSentThisMonth >= this.monthlyEmailLimit;
  }

  /**
   * Get the number of remaining emails for this month
   */
  getRemainingEmails(): number {
    return Math.max(0, this.monthlyEmailLimit - this.emailsSentThisMonth);
  }

  /**
   * Check if the access token has expired
   */
  isTokenExpired(): boolean {
    return new Date() >= this.tokenExpiresAt;
  }

  /**
   * Check if the token is expiring soon (within buffer period)
   * @param bufferMs - Buffer time in milliseconds (default 1 minute)
   */
  isTokenExpiringSoon(bufferMs: number = 60000): boolean {
    const expiryWithBuffer = new Date(this.tokenExpiresAt.getTime() - bufferMs);
    return new Date() >= expiryWithBuffer;
  }
}
