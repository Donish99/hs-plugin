import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OutreachRecord } from '../../entities/outreach-record.entity';
import { Response } from '../../entities/response.entity';
import { Campaign } from '../../entities/campaign.entity';

/**
 * Activity event types
 */
export type ActivityEvent =
  | 'email_sent'
  | 'email_delivered'
  | 'email_opened'
  | 'email_clicked'
  | 'email_replied'
  | 'email_bounced'
  | 'sms_sent'
  | 'sms_delivered'
  | 'sms_replied'
  | 'meeting_booked'
  | 'campaign_started'
  | 'campaign_completed'
  | 'campaign_paused'
  | 'contact_reactivated'
  | 'response_classified';

/**
 * Activity log entry
 */
export interface ActivityLogEntry {
  id: string;
  eventType: ActivityEvent;
  contactName?: string;
  contactEmail?: string;
  companyName?: string;
  campaignId?: string;
  campaignName?: string;
  subject?: string;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Activity log filter
 */
export interface ActivityLogFilter {
  eventType?: ActivityEvent;
  contactEmail?: string;
  campaignId?: string;
  startDate?: Date;
  endDate?: Date;
  search?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Paginated activity log result
 */
export interface ActivityLogResult {
  entries: ActivityLogEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Retention policy
 */
export interface RetentionPolicy {
  retentionDays: number;
  lastCleanup?: Date;
}

/**
 * Raw activity data from database
 */
interface RawActivityData {
  id: string;
  event_type: string;
  contact_name?: string;
  contact_email?: string;
  company_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  subject?: string;
  created_at: Date;
}

// All available activity event types
const ACTIVITY_TYPES: ActivityEvent[] = [
  'email_sent',
  'email_delivered',
  'email_opened',
  'email_clicked',
  'email_replied',
  'email_bounced',
  'sms_sent',
  'sms_delivered',
  'sms_replied',
  'meeting_booked',
  'campaign_started',
  'campaign_completed',
  'campaign_paused',
  'contact_reactivated',
  'response_classified',
];

// Default retention period in days
const RETENTION_DAYS = 90;

@Injectable()
export class ActivityLogService {
  constructor(
    @InjectRepository(OutreachRecord)
    private readonly outreachRepository: Repository<OutreachRecord>,
    @InjectRepository(Response)
    private readonly _responseRepository: Repository<Response>,
    @InjectRepository(Campaign)
    private readonly _campaignRepository: Repository<Campaign>,
  ) {}

  /**
   * Get paginated activity log
   */
  async getActivityLog(
    accountId: string,
    filter: ActivityLogFilter = {},
  ): Promise<ActivityLogResult> {
    const page = filter.page || 1;
    const pageSize = filter.pageSize || 20;
    const skip = (page - 1) * pageSize;

    const qb = this.outreachRepository
      .createQueryBuilder('outreach')
      .select('outreach.id', 'id')
      .addSelect(
        `CASE
          WHEN outreach.replied_at IS NOT NULL THEN 'email_replied'
          WHEN outreach.clicked_at IS NOT NULL THEN 'email_clicked'
          WHEN outreach.opened_at IS NOT NULL THEN 'email_opened'
          WHEN outreach.status = 'bounced' THEN 'email_bounced'
          WHEN outreach.status = 'delivered' THEN 'email_delivered'
          WHEN outreach.sent_at IS NOT NULL THEN 'email_sent'
          ELSE 'email_sent'
        END`,
        'event_type',
      )
      .addSelect('outreach.contact_name', 'contact_name')
      .addSelect('outreach.contact_email', 'contact_email')
      .addSelect('outreach.company_name', 'company_name')
      .addSelect('outreach.campaign_id', 'campaign_id')
      .addSelect('campaign.name', 'campaign_name')
      .addSelect('outreach.subject', 'subject')
      .addSelect('outreach.created_at', 'created_at')
      .leftJoin('outreach.campaign', 'campaign')
      .where('outreach.account_id = :accountId', { accountId });

    // Apply filters
    if (filter.eventType) {
      qb.andWhere(this.buildEventTypeCondition(filter.eventType), {
        eventType: filter.eventType,
      });
    }

    if (filter.contactEmail) {
      qb.andWhere('outreach.contact_email = :contactEmail', {
        contactEmail: filter.contactEmail,
      });
    }

    if (filter.campaignId) {
      qb.andWhere('outreach.campaign_id = :campaignId', {
        campaignId: filter.campaignId,
      });
    }

    if (filter.startDate) {
      qb.andWhere('outreach.created_at >= :startDate', {
        startDate: filter.startDate,
      });
    }

    if (filter.endDate) {
      qb.andWhere('outreach.created_at <= :endDate', {
        endDate: filter.endDate,
      });
    }

    if (filter.search) {
      qb.andWhere(
        `(outreach.contact_name ILIKE :search OR outreach.contact_email ILIKE :search OR outreach.company_name ILIKE :search OR outreach.subject ILIKE :search)`,
        { search: `%${filter.search}%` },
      );
    }

    qb.orderBy('outreach.created_at', 'DESC').skip(skip).take(pageSize);

    const rawEntries = (await qb.getRawMany()) as RawActivityData[];
    const total = await this.countActivityEntries(accountId, filter);

    return {
      entries: rawEntries.map((row) => this.mapToActivityEntry(row)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Get all available activity types
   */
  getActivityTypes(): ActivityEvent[] {
    return [...ACTIVITY_TYPES];
  }

  /**
   * Export activity log
   */
  async exportActivityLog(
    accountId: string,
    format: 'csv' | 'json',
    filter: ActivityLogFilter = {},
  ): Promise<string> {
    const qb = this.outreachRepository
      .createQueryBuilder('outreach')
      .select('outreach.id', 'id')
      .addSelect(
        `CASE
          WHEN outreach.replied_at IS NOT NULL THEN 'email_replied'
          WHEN outreach.clicked_at IS NOT NULL THEN 'email_clicked'
          WHEN outreach.opened_at IS NOT NULL THEN 'email_opened'
          WHEN outreach.status = 'bounced' THEN 'email_bounced'
          WHEN outreach.status = 'delivered' THEN 'email_delivered'
          WHEN outreach.sent_at IS NOT NULL THEN 'email_sent'
          ELSE 'email_sent'
        END`,
        'event_type',
      )
      .addSelect('outreach.contact_name', 'contact_name')
      .addSelect('outreach.contact_email', 'contact_email')
      .addSelect('campaign.name', 'campaign_name')
      .addSelect('outreach.created_at', 'created_at')
      .leftJoin('outreach.campaign', 'campaign')
      .where('outreach.account_id = :accountId', { accountId });

    // Apply date filters if provided
    if (filter.startDate) {
      qb.andWhere('outreach.created_at >= :startDate', {
        startDate: filter.startDate,
      });
    }

    if (filter.endDate) {
      qb.andWhere('outreach.created_at <= :endDate', {
        endDate: filter.endDate,
      });
    }

    qb.orderBy('outreach.created_at', 'DESC');

    const rawEntries = (await qb.getRawMany()) as RawActivityData[];
    const entries = rawEntries.map((row) => this.mapToActivityEntry(row));

    if (format === 'json') {
      return JSON.stringify(entries, null, 2);
    }

    return this.toCsv(entries);
  }

  /**
   * Get retention policy
   */
  getRetentionPolicy(): RetentionPolicy {
    return {
      retentionDays: RETENTION_DAYS,
    };
  }

  /**
   * Cleanup old entries based on retention policy
   */
  async cleanupOldEntries(accountId: string): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);

    const result = await this.outreachRepository
      .createQueryBuilder()
      .delete()
      .from(OutreachRecord)
      .where('account_id = :accountId', { accountId })
      .andWhere('created_at < :cutoffDate', { cutoffDate })
      .execute();

    return result.affected || 0;
  }

  /**
   * Count activity entries with filters
   */
  private async countActivityEntries(
    accountId: string,
    filter: ActivityLogFilter,
  ): Promise<number> {
    const qb = this.outreachRepository
      .createQueryBuilder('outreach')
      .where('outreach.account_id = :accountId', { accountId });

    if (filter.contactEmail) {
      qb.andWhere('outreach.contact_email = :contactEmail', {
        contactEmail: filter.contactEmail,
      });
    }

    if (filter.campaignId) {
      qb.andWhere('outreach.campaign_id = :campaignId', {
        campaignId: filter.campaignId,
      });
    }

    if (filter.startDate) {
      qb.andWhere('outreach.created_at >= :startDate', {
        startDate: filter.startDate,
      });
    }

    if (filter.endDate) {
      qb.andWhere('outreach.created_at <= :endDate', {
        endDate: filter.endDate,
      });
    }

    return qb.getCount();
  }

  /**
   * Build event type condition for filtering
   */
  private buildEventTypeCondition(eventType: ActivityEvent): string {
    switch (eventType) {
      case 'email_replied':
        return 'outreach.replied_at IS NOT NULL';
      case 'email_clicked':
        return 'outreach.clicked_at IS NOT NULL AND outreach.replied_at IS NULL';
      case 'email_opened':
        return 'outreach.opened_at IS NOT NULL AND outreach.clicked_at IS NULL';
      case 'email_bounced':
        return "outreach.status = 'bounced'";
      case 'email_delivered':
        return "outreach.status = 'delivered'";
      case 'email_sent':
        return 'outreach.sent_at IS NOT NULL';
      default:
        return '1=1';
    }
  }

  /**
   * Map raw data to activity entry
   */
  private mapToActivityEntry(row: RawActivityData): ActivityLogEntry {
    return {
      id: row.id,
      eventType: row.event_type as ActivityEvent,
      contactName: row.contact_name,
      contactEmail: row.contact_email,
      companyName: row.company_name,
      campaignId: row.campaign_id,
      campaignName: row.campaign_name,
      subject: row.subject,
      createdAt: row.created_at,
    };
  }

  /**
   * Convert entries to CSV format
   */
  private toCsv(entries: ActivityLogEntry[]): string {
    const headers = [
      'ID',
      'Event Type',
      'Contact Name',
      'Contact Email',
      'Campaign',
      'Subject',
      'Date',
    ];

    const rows = entries.map((entry) => [
      entry.id,
      entry.eventType,
      entry.contactName || '',
      entry.contactEmail || '',
      entry.campaignName || '',
      entry.subject || '',
      entry.createdAt.toISOString(),
    ]);

    return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
  }
}
