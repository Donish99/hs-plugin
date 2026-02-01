import { Injectable, Logger } from '@nestjs/common';
import { Client } from '@hubspot/api-client';
import { AssociationSpecAssociationCategoryEnum } from '@hubspot/api-client/lib/codegen/crm/associations/v4';
import { OAuthService } from '../../hubspot/services/oauth.service';

export interface EmailLogData {
  contactId: string;
  subject: string;
  body: string;
  textBody?: string;
  toEmail: string;
  fromEmail?: string;
  sendgridMessageId?: string;
  dealId?: string;
  campaignId?: string;
}

export interface SmsLogData {
  contactId: string;
  body: string;
  toPhone: string;
  fromPhone?: string;
  twilioSid?: string;
  dealId?: string;
}

export interface TaskData {
  contactId: string;
  subject: string;
  body: string;
  dueDate: Date;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  ownerId?: string;
  dealId?: string;
}

export interface BounceData {
  contactId: string;
  email: string;
  reason: string;
  bounceType: 'hard' | 'soft';
}

export interface LogResult {
  success: boolean;
  engagementId?: string;
  taskId?: string;
  associatedContactId?: string;
  associatedDealId?: string;
  ownerId?: string;
  timestamp?: number;
  updatedAt?: number;
  contactUpdated?: boolean;
  error?: string;
}

export interface BatchLogResult {
  successful: number;
  failed: number;
  results: LogResult[];
}

/**
 * Service for logging activities to HubSpot CRM
 */
@Injectable()
export class HubspotLoggerService {
  private readonly logger = new Logger(HubspotLoggerService.name);

  constructor(private readonly oauthService: OAuthService) {}

  /**
   * Log a sent email to HubSpot
   */
  async logEmailSent(portalId: number, data: EmailLogData): Promise<LogResult> {
    try {
      const accessToken = await this.oauthService.getValidAccessToken(portalId);
      const client = new Client({ accessToken });
      const timestamp = Date.now();

      // Create email engagement
      const emailProperties = {
        hs_timestamp: new Date(timestamp).toISOString(),
        hs_email_direction: 'EMAIL',
        hs_email_status: 'SENT',
        hs_email_subject: data.subject,
        hs_email_text: data.textBody || this.stripHtml(data.body),
        hs_email_html: data.body,
        hs_email_to_email: data.toEmail,
        ...(data.fromEmail && { hs_email_from_email: data.fromEmail }),
        ...(data.sendgridMessageId && {
          hs_email_message_id: data.sendgridMessageId,
        }),
      };

      const emailResponse = await client.crm.objects.emails.basicApi.create({
        properties: emailProperties,
        associations: [],
      });

      // Associate with contact
      await client.crm.associations.v4.basicApi.create(
        'emails',
        emailResponse.id,
        'contacts',
        data.contactId,
        [{ associationCategory: AssociationSpecAssociationCategoryEnum.HubspotDefined, associationTypeId: 198 }],
      );

      // Associate with deal if provided
      if (data.dealId) {
        await client.crm.associations.v4.basicApi.create(
          'emails',
          emailResponse.id,
          'deals',
          data.dealId,
          [{ associationCategory: AssociationSpecAssociationCategoryEnum.HubspotDefined, associationTypeId: 186 }],
        );
      }

      this.logger.log(`Logged email to HubSpot for contact ${data.contactId}`);

      return {
        success: true,
        engagementId: emailResponse.id,
        associatedContactId: data.contactId,
        associatedDealId: data.dealId,
        timestamp,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to log email to HubSpot: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Log a sent SMS to HubSpot as a communication
   */
  async logSmsSent(portalId: number, data: SmsLogData): Promise<LogResult> {
    try {
      const accessToken = await this.oauthService.getValidAccessToken(portalId);
      const client = new Client({ accessToken });
      const timestamp = Date.now();

      // Create note engagement for SMS (HubSpot doesn't have native SMS type)
      const noteProperties = {
        hs_timestamp: new Date(timestamp).toISOString(),
        hs_note_body: `SMS sent to ${data.toPhone}:\n\n${data.body}${data.twilioSid ? `\n\n[Twilio SID: ${data.twilioSid}]` : ''}`,
      };

      const noteResponse = await client.crm.objects.notes.basicApi.create({
        properties: noteProperties,
        associations: [],
      });

      // Associate with contact
      await client.crm.associations.v4.basicApi.create(
        'notes',
        noteResponse.id,
        'contacts',
        data.contactId,
        [{ associationCategory: AssociationSpecAssociationCategoryEnum.HubspotDefined, associationTypeId: 202 }],
      );

      this.logger.log(`Logged SMS to HubSpot for contact ${data.contactId}`);

      return {
        success: true,
        engagementId: noteResponse.id,
        associatedContactId: data.contactId,
        timestamp,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to log SMS to HubSpot: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Update contact's last contacted date
   */
  async updateContactLastContacted(
    portalId: number,
    contactId: string,
  ): Promise<LogResult> {
    try {
      const accessToken = await this.oauthService.getValidAccessToken(portalId);
      const client = new Client({ accessToken });
      const updatedAt = Date.now();

      await client.crm.contacts.basicApi.update(contactId, {
        properties: {
          notes_last_contacted: new Date(updatedAt).toISOString().split('T')[0],
        },
      });

      this.logger.log(`Updated last contacted date for contact ${contactId}`);

      return {
        success: true,
        updatedAt,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to update contact: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Create a follow-up task in HubSpot
   */
  async createFollowUpTask(portalId: number, data: TaskData): Promise<LogResult> {
    try {
      const accessToken = await this.oauthService.getValidAccessToken(portalId);
      const client = new Client({ accessToken });

      const priorityMap = {
        LOW: 'LOW',
        MEDIUM: 'MEDIUM',
        HIGH: 'HIGH',
      };

      const taskProperties = {
        hs_task_subject: data.subject,
        hs_task_body: data.body,
        hs_task_priority: priorityMap[data.priority],
        hs_task_status: 'NOT_STARTED',
        hs_timestamp: data.dueDate.toISOString(),
        ...(data.ownerId && { hubspot_owner_id: data.ownerId }),
      };

      const taskResponse = await client.crm.objects.tasks.basicApi.create({
        properties: taskProperties,
        associations: [],
      });

      // Associate with contact
      await client.crm.associations.v4.basicApi.create(
        'tasks',
        taskResponse.id,
        'contacts',
        data.contactId,
        [{ associationCategory: AssociationSpecAssociationCategoryEnum.HubspotDefined, associationTypeId: 204 }],
      );

      this.logger.log(`Created follow-up task for contact ${data.contactId}`);

      return {
        success: true,
        taskId: taskResponse.id,
        associatedContactId: data.contactId,
        ownerId: data.ownerId,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to create task: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Update email engagement status
   */
  async updateEngagementStatus(
    portalId: number,
    engagementId: string,
    status: 'OPENED' | 'CLICKED' | 'REPLIED' | 'BOUNCED',
  ): Promise<LogResult> {
    if (!engagementId || engagementId.trim() === '') {
      return { success: false, error: 'Invalid engagement ID' };
    }

    try {
      const accessToken = await this.oauthService.getValidAccessToken(portalId);
      const client = new Client({ accessToken });

      await client.crm.objects.emails.basicApi.update(engagementId, {
        properties: {
          hs_email_status: status,
        },
      });

      this.logger.log(`Updated engagement ${engagementId} status to ${status}`);

      return { success: true };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to update engagement status: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Log an email bounce
   */
  async logBounce(portalId: number, data: BounceData): Promise<LogResult> {
    try {
      const accessToken = await this.oauthService.getValidAccessToken(portalId);
      const client = new Client({ accessToken });

      // Create note about the bounce
      const noteProperties = {
        hs_timestamp: new Date().toISOString(),
        hs_note_body: `Email bounce (${data.bounceType}): ${data.email}\nReason: ${data.reason}`,
      };

      await client.crm.objects.notes.basicApi.create({
        properties: noteProperties,
        associations: [],
      });

      // Update contact email status for hard bounces
      let contactUpdated = false;
      if (data.bounceType === 'hard') {
        await client.crm.contacts.basicApi.update(data.contactId, {
          properties: {
            hs_email_bad_address: 'true',
          },
        });
        contactUpdated = true;
      }

      this.logger.log(`Logged bounce for contact ${data.contactId}`);

      return { success: true, contactUpdated };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to log bounce: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Log multiple emails in batch
   */
  async logEmailsBatch(
    portalId: number,
    emails: EmailLogData[],
  ): Promise<BatchLogResult> {
    const results: LogResult[] = [];
    let successful = 0;
    let failed = 0;

    for (const email of emails) {
      const result = await this.logEmailSent(portalId, email);
      results.push(result);
      if (result.success) {
        successful++;
      } else {
        failed++;
      }
    }

    return { successful, failed, results };
  }

  /**
   * Strip HTML tags from content
   */
  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').trim();
  }
}
