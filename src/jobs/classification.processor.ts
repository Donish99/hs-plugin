import { Process, Processor } from '@nestjs/bull';
import { Logger, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bull';
import {
  ClassifierService,
  ClassificationType,
  ClassificationResult,
  ClassificationRequest,
} from '../ai/services/classifier.service';
import { ActionsService } from '../campaigns/services/actions.service';
import { ContactsService } from '../hubspot/services/contacts.service';
import { OutreachRecord } from '../entities/outreach-record.entity';
import { Response, ResponseSentiment, ResponseIntent } from '../entities/response.entity';

export interface ClassificationJobData {
  outreachId: string;
  contactId: string;
  portalId: number;
  replyContent?: string;
  emailId?: string;
}

export interface ClassificationProcessingResult {
  success: boolean;
  classification?: ClassificationType;
  confidence?: number;
  actionsExecuted?: string[];
  actionErrors?: string[];
  error?: string;
}

/**
 * Processor for classifying email responses using AI
 * Triggers automated actions based on classification
 */
@Injectable()
@Processor('classification')
export class ClassificationProcessor {
  private readonly logger = new Logger(ClassificationProcessor.name);

  constructor(
    private readonly classifierService: ClassifierService,
    private readonly actionsService: ActionsService,
    private readonly contactsService: ContactsService,
    @InjectRepository(OutreachRecord)
    private readonly outreachRepository: Repository<OutreachRecord>,
    @InjectRepository(Response)
    private readonly responseRepository: Repository<Response>,
  ) {}

  /**
   * Process a classification job
   */
  @Process('classify-response')
  async processClassification(job: Job<ClassificationJobData>): Promise<ClassificationProcessingResult> {
    const { outreachId, contactId, portalId, replyContent, emailId } = job.data;

    this.logger.log(`Processing classification for outreach ${outreachId}`);

    try {
      // Find the outreach record
      const outreach = await this.outreachRepository.findOne({
        where: { id: outreachId },
      });

      if (!outreach) {
        this.logger.warn(`Outreach record ${outreachId} not found`);
        return {
          success: false,
          error: 'Outreach record not found',
        };
      }

      // Get reply content if not provided
      let content = replyContent;
      if (!content && emailId) {
        const emailData = await this.contactsService.getEmailContent(portalId, emailId);
        content = emailData?.body || '';
      }

      if (!content) {
        this.logger.warn(`No reply content available for outreach ${outreachId}`);
        return {
          success: false,
          error: 'No reply content available',
        };
      }

      // Build classification request
      const classificationRequest: ClassificationRequest = {
        emailContent: content,
        contactId,
        portalId,
      };

      // Classify the response
      const classification = await this.classifierService.classifyResponse(classificationRequest);

      this.logger.log(
        `Classified response for ${contactId}: ${classification.classification} (confidence: ${classification.confidence})`,
      );

      // Store the classification result
      await this.storeClassificationResult(outreach, classification, content);

      // Execute actions based on classification
      const actionResult = await this.actionsService.executeAction({
        portalId,
        contactId,
        outreachId,
        classification,
      });

      return {
        success: true,
        classification: classification.classification,
        confidence: classification.confidence,
        actionsExecuted: actionResult.actionsExecuted,
        actionErrors: actionResult.errors.length > 0 ? actionResult.errors : undefined,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Classification failed for ${outreachId}: ${errorMessage}`);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Store the classification result in the responses table
   */
  private async storeClassificationResult(
    outreach: OutreachRecord,
    classification: ClassificationResult,
    content: string,
  ): Promise<Response> {
    const response = this.responseRepository.create({
      outreachId: outreach.id,
      sentiment: this.getSentimentFromClassification(classification.classification),
      intent: this.getIntentFromClassification(classification.classification),
      content,
      actionTaken: this.actionsService.getActionsForClassification(classification.classification).join(', '),
    });

    return this.responseRepository.save(response);
  }

  /**
   * Map classification type to sentiment
   */
  private getSentimentFromClassification(classification: ClassificationType): ResponseSentiment {
    switch (classification) {
      case ClassificationType.INTERESTED:
        return ResponseSentiment.POSITIVE;
      case ClassificationType.NOT_NOW:
        return ResponseSentiment.NEUTRAL;
      case ClassificationType.NOT_INTERESTED:
        return ResponseSentiment.NEGATIVE;
      case ClassificationType.UNSUBSCRIBE:
        return ResponseSentiment.NEGATIVE;
      case ClassificationType.OUT_OF_OFFICE:
        return ResponseSentiment.NEUTRAL;
      case ClassificationType.BOUNCED:
        return ResponseSentiment.NEUTRAL;
      default:
        return ResponseSentiment.NEUTRAL;
    }
  }

  /**
   * Map classification type to intent
   */
  private getIntentFromClassification(classification: ClassificationType): ResponseIntent {
    switch (classification) {
      case ClassificationType.INTERESTED:
        return ResponseIntent.INTERESTED;
      case ClassificationType.NOT_NOW:
        return ResponseIntent.NOT_NOW;
      case ClassificationType.NOT_INTERESTED:
        return ResponseIntent.NOT_INTERESTED;
      case ClassificationType.UNSUBSCRIBE:
        return ResponseIntent.UNSUBSCRIBE;
      case ClassificationType.OUT_OF_OFFICE:
        return ResponseIntent.OUT_OF_OFFICE;
      case ClassificationType.BOUNCED:
        return ResponseIntent.BOUNCED;
      default:
        return ResponseIntent.NOT_NOW;
    }
  }
}
