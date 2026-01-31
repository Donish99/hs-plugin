import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ClassificationType,
  ClassificationResult,
} from '../../ai/services/classifier.service';
import { HubspotLoggerService } from '../../outreach/services/hubspot-logger.service';
import { CampaignService } from './campaign.service';
import { OutreachRecord, OutreachStatus } from '../../entities/outreach-record.entity';
import { Campaign } from '../../entities/campaign.entity';

export enum ActionType {
  CREATE_TASK = 'create_task',
  PAUSE_CAMPAIGN = 'pause_campaign',
  STOP_CAMPAIGN = 'stop_campaign',
  SCHEDULE_FOLLOWUP = 'schedule_followup',
  MARK_CONTACT = 'mark_contact',
  REMOVE_FROM_ALL_CAMPAIGNS = 'remove_from_all_campaigns',
  ADD_TO_SUPPRESSION = 'add_to_suppression',
  RESCHEDULE = 'reschedule',
  MARK_EMAIL_INVALID = 'mark_email_invalid',
  NOTIFY_SALES_REP = 'notify_sales_rep',
}

export interface ActionRequest {
  portalId: number;
  contactId: string;
  outreachId: string;
  classification: ClassificationResult;
}

export interface ActionResult {
  success: boolean;
  actionsExecuted: ActionType[];
  errors: string[];
}

interface SuppressionEntry {
  contactId: string;
  accountId: string;
  reason: string;
  addedAt: Date;
}

/**
 * Service for executing automated actions based on response classification
 */
@Injectable()
export class ActionsService {
  private readonly logger = new Logger(ActionsService.name);
  private readonly suppressionList: Map<string, SuppressionEntry> = new Map();
  private readonly defaultFollowUpDays = 30;

  constructor(
    private readonly hubspotLogger: HubspotLoggerService,
    private readonly campaignService: CampaignService,
    @InjectRepository(OutreachRecord)
    private readonly outreachRepository: Repository<OutreachRecord>,
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,
  ) {}

  /**
   * Execute actions based on classification result
   */
  async executeAction(request: ActionRequest): Promise<ActionResult> {
    const result: ActionResult = {
      success: true,
      actionsExecuted: [],
      errors: [],
    };

    const { portalId, contactId, outreachId, classification } = request;

    try {
      // Get the outreach record
      const outreach = await this.outreachRepository.findOne({
        where: { id: outreachId },
      });

      if (!outreach) {
        result.success = false;
        result.errors.push('Outreach record not found');
        return result;
      }

      // Execute actions based on classification type
      switch (classification.classification) {
        case ClassificationType.INTERESTED:
          await this.handleInterestedResponse(
            portalId,
            contactId,
            outreach,
            result,
          );
          break;

        case ClassificationType.NOT_NOW:
          await this.handleNotNowResponse(outreach, result);
          break;

        case ClassificationType.NOT_INTERESTED:
          await this.handleNotInterestedResponse(outreach, result);
          break;

        case ClassificationType.UNSUBSCRIBE:
          await this.handleUnsubscribeResponse(
            portalId,
            contactId,
            outreach,
            result,
          );
          break;

        case ClassificationType.OUT_OF_OFFICE:
          await this.handleOutOfOfficeResponse(
            outreach,
            classification,
            result,
          );
          break;

        case ClassificationType.BOUNCED:
          await this.handleBouncedResponse(portalId, outreach, result);
          break;

        default:
          this.logger.warn(
            `Unknown classification: ${classification.classification}`,
          );
      }

      this.logger.log(
        `Actions executed for ${contactId}: ${result.actionsExecuted.join(', ')}`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      result.success = false;
      result.errors.push(errorMessage);
      this.logger.error(`Action execution failed: ${errorMessage}`);
    }

    return result;
  }

  /**
   * Handle INTERESTED response
   */
  private async handleInterestedResponse(
    portalId: number,
    contactId: string,
    outreach: OutreachRecord,
    result: ActionResult,
  ): Promise<void> {
    // Create task for sales rep
    try {
      await this.hubspotLogger.createFollowUpTask(portalId, {
        contactId: outreach.hubspotContactId.toString(),
        subject: 'Follow up: Interested response received',
        body: 'Contact has expressed interest. Please follow up promptly.',
        dueDate: new Date(),
        priority: 'HIGH',
      });
      result.actionsExecuted.push(ActionType.CREATE_TASK);
    } catch (error) {
      result.errors.push('Failed to create task');
    }

    // Pause the campaign for this contact
    if (outreach.campaignId) {
      try {
        await this.campaignService.pauseCampaign(outreach.campaignId);
        result.actionsExecuted.push(ActionType.PAUSE_CAMPAIGN);
      } catch (error) {
        result.errors.push('Failed to pause campaign');
      }
    }
  }

  /**
   * Handle NOT_NOW response
   */
  private async handleNotNowResponse(
    outreach: OutreachRecord,
    result: ActionResult,
  ): Promise<void> {
    // Schedule follow-up
    const followUpDate = new Date();
    followUpDate.setDate(followUpDate.getDate() + this.defaultFollowUpDays);

    outreach.scheduledAt = followUpDate;
    outreach.status = OutreachStatus.PENDING;
    await this.outreachRepository.save(outreach);

    result.actionsExecuted.push(ActionType.SCHEDULE_FOLLOWUP);
  }

  /**
   * Handle NOT_INTERESTED response
   */
  private async handleNotInterestedResponse(
    outreach: OutreachRecord,
    result: ActionResult,
  ): Promise<void> {
    // Mark contact
    outreach.status = OutreachStatus.FAILED;
    await this.outreachRepository.save(outreach);
    result.actionsExecuted.push(ActionType.MARK_CONTACT);

    // Stop the campaign for this contact
    if (outreach.campaignId) {
      try {
        await this.campaignService.stopCampaign(outreach.campaignId);
        result.actionsExecuted.push(ActionType.STOP_CAMPAIGN);
      } catch (error) {
        result.errors.push('Failed to stop campaign');
      }
    }
  }

  /**
   * Handle UNSUBSCRIBE response
   */
  private async handleUnsubscribeResponse(
    portalId: number,
    contactId: string,
    outreach: OutreachRecord,
    result: ActionResult,
  ): Promise<void> {
    // Remove from all campaigns
    if (outreach.accountId) {
      const pendingOutreach = await this.outreachRepository.find({
        where: {
          accountId: outreach.accountId,
          hubspotContactId: outreach.hubspotContactId,
          status: OutreachStatus.PENDING,
        },
      });

      if (pendingOutreach.length > 0) {
        await this.outreachRepository.update(
          { id: pendingOutreach.map((o) => o.id)[0] },
          { status: OutreachStatus.FAILED },
        );
      }

      result.actionsExecuted.push(ActionType.REMOVE_FROM_ALL_CAMPAIGNS);
    }

    // Add to suppression list
    await this.addToSuppressionList(
      outreach.accountId,
      contactId,
      'unsubscribe',
    );
    result.actionsExecuted.push(ActionType.ADD_TO_SUPPRESSION);
  }

  /**
   * Handle OUT_OF_OFFICE response
   */
  private async handleOutOfOfficeResponse(
    outreach: OutreachRecord,
    classification: ClassificationResult,
    result: ActionResult,
  ): Promise<void> {
    // Calculate reschedule date
    let rescheduleDate: Date;

    if (classification.metadata?.returnDate) {
      rescheduleDate = new Date(classification.metadata.returnDate as string);
      // Add a day buffer after return
      rescheduleDate.setDate(rescheduleDate.getDate() + 1);
    } else {
      // Default to 7 days if no return date
      rescheduleDate = new Date();
      rescheduleDate.setDate(rescheduleDate.getDate() + 7);
    }

    outreach.scheduledAt = rescheduleDate;
    await this.outreachRepository.save(outreach);
    result.actionsExecuted.push(ActionType.RESCHEDULE);

    // Pause the campaign temporarily
    if (outreach.campaignId) {
      try {
        await this.campaignService.pauseCampaign(outreach.campaignId);
        result.actionsExecuted.push(ActionType.PAUSE_CAMPAIGN);
      } catch (error) {
        result.errors.push('Failed to pause campaign');
      }
    }
  }

  /**
   * Handle BOUNCED response
   */
  private async handleBouncedResponse(
    portalId: number,
    outreach: OutreachRecord,
    result: ActionResult,
  ): Promise<void> {
    // Mark email as invalid in HubSpot
    try {
      await this.hubspotLogger.logBounce(portalId, {
        contactId: outreach.hubspotContactId.toString(),
        email: outreach.contactEmail || '',
        reason: 'Email bounced',
        bounceType: 'hard',
      });
      result.actionsExecuted.push(ActionType.MARK_EMAIL_INVALID);
    } catch (error) {
      result.errors.push('Failed to log bounce');
    }

    // Stop outreach for this contact
    outreach.status = OutreachStatus.BOUNCED;
    await this.outreachRepository.save(outreach);
    result.actionsExecuted.push(ActionType.STOP_CAMPAIGN);
  }

  /**
   * Get actions for a classification type
   */
  getActionsForClassification(classification: ClassificationType): ActionType[] {
    const actionMap: Record<ClassificationType, ActionType[]> = {
      [ClassificationType.INTERESTED]: [
        ActionType.CREATE_TASK,
        ActionType.PAUSE_CAMPAIGN,
      ],
      [ClassificationType.NOT_NOW]: [ActionType.SCHEDULE_FOLLOWUP],
      [ClassificationType.NOT_INTERESTED]: [
        ActionType.STOP_CAMPAIGN,
        ActionType.MARK_CONTACT,
      ],
      [ClassificationType.UNSUBSCRIBE]: [
        ActionType.REMOVE_FROM_ALL_CAMPAIGNS,
        ActionType.ADD_TO_SUPPRESSION,
      ],
      [ClassificationType.OUT_OF_OFFICE]: [
        ActionType.RESCHEDULE,
        ActionType.PAUSE_CAMPAIGN,
      ],
      [ClassificationType.BOUNCED]: [
        ActionType.MARK_EMAIL_INVALID,
        ActionType.STOP_CAMPAIGN,
      ],
      [ClassificationType.UNKNOWN]: [],
    };

    return actionMap[classification] || [];
  }

  /**
   * Add contact to suppression list
   */
  async addToSuppressionList(
    accountId: string,
    contactId: string,
    reason: string,
  ): Promise<{ success: boolean }> {
    const key = `${accountId}:${contactId}`;
    this.suppressionList.set(key, {
      contactId,
      accountId,
      reason,
      addedAt: new Date(),
    });

    this.logger.log(`Added ${contactId} to suppression list for ${accountId}`);
    return { success: true };
  }

  /**
   * Check if contact is in suppression list
   */
  async isInSuppressionList(
    accountId: string,
    contactId: string,
  ): Promise<boolean> {
    const key = `${accountId}:${contactId}`;
    return this.suppressionList.has(key);
  }

  /**
   * Remove contact from suppression list
   */
  async removeFromSuppressionList(
    accountId: string,
    contactId: string,
  ): Promise<{ success: boolean }> {
    const key = `${accountId}:${contactId}`;
    const deleted = this.suppressionList.delete(key);
    return { success: deleted };
  }

  /**
   * Schedule a follow-up for an outreach record
   */
  async scheduleFollowUp(
    outreachId: string,
    followUpDate: Date,
  ): Promise<{ success: boolean }> {
    const outreach = await this.outreachRepository.findOne({
      where: { id: outreachId },
    });

    if (!outreach) {
      return { success: false };
    }

    outreach.scheduledAt = followUpDate;
    outreach.status = OutreachStatus.PENDING;
    await this.outreachRepository.save(outreach);

    return { success: true };
  }

  /**
   * Get suppression list for an account
   */
  async getSuppressionList(accountId: string): Promise<SuppressionEntry[]> {
    const entries: SuppressionEntry[] = [];

    this.suppressionList.forEach((entry, key) => {
      if (key.startsWith(`${accountId}:`)) {
        entries.push(entry);
      }
    });

    return entries;
  }
}
