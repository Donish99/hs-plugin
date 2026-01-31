import { Injectable, Logger } from '@nestjs/common';
import { OpenAIService } from './openai.service';

export enum ClassificationType {
  INTERESTED = 'INTERESTED',
  NOT_NOW = 'NOT_NOW',
  NOT_INTERESTED = 'NOT_INTERESTED',
  UNSUBSCRIBE = 'UNSUBSCRIBE',
  OUT_OF_OFFICE = 'OUT_OF_OFFICE',
  BOUNCED = 'BOUNCED',
  UNKNOWN = 'UNKNOWN',
}

export interface ClassificationRequest {
  emailContent: string;
  contactId: string;
  portalId: number;
  previousContext?: string;
}

export interface ClassificationResult {
  classification: ClassificationType;
  confidence: number;
  reason: string;
  metadata?: Record<string, unknown>;
  error?: string;
}

interface AIClassificationResponse {
  classification: string;
  confidence: number;
  reason: string;
  metadata?: Record<string, unknown>;
}

/**
 * Service for AI-powered email response classification
 */
@Injectable()
export class ClassifierService {
  private readonly logger = new Logger(ClassifierService.name);
  private readonly defaultConfidenceThreshold = 0.8;

  constructor(private readonly openaiService: OpenAIService) {}

  /**
   * Classify an email response using AI
   */
  async classifyResponse(
    request: ClassificationRequest,
  ): Promise<ClassificationResult> {
    try {
      const prompt = this.buildClassificationPrompt(request.emailContent);

      const response = await this.openaiService.generateJson<AIClassificationResponse>(
        prompt,
        {
          systemPrompt: this.getSystemPrompt(),
          temperature: 0.3, // Lower temperature for more consistent classification
        },
      );

      const result = this.parseClassificationResponse(response);

      this.logger.log(
        `Classified response for contact ${request.contactId}: ${result.classification} (${result.confidence})`,
      );

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Classification failed: ${errorMessage}`);

      return {
        classification: ClassificationType.UNKNOWN,
        confidence: 0,
        reason: 'Classification failed',
        error: errorMessage,
      };
    }
  }

  /**
   * Build the classification prompt
   */
  buildClassificationPrompt(emailContent: string): string {
    return `Classify the following email reply into one of these categories:

- INTERESTED: The sender wants to learn more, schedule a call, or continue the conversation
- NOT_NOW: The timing isn't right, but they may be interested later (check back in X months)
- NOT_INTERESTED: Polite decline, they don't want to proceed
- UNSUBSCRIBE: Explicit request to be removed from emails/mailing list
- OUT_OF_OFFICE: Automated away/vacation message
- BOUNCED: Email delivery failure or invalid address notification

Email Reply:
"""
${emailContent}
"""

Respond with a JSON object containing:
- classification: one of the categories above
- confidence: a number between 0.0 and 1.0 indicating your confidence
- reason: a brief explanation of why you chose this classification
- metadata: (optional) any relevant extracted data like return dates for OOO

JSON Response:`;
  }

  /**
   * Get the system prompt for classification
   */
  private getSystemPrompt(): string {
    return `You are an expert email classifier for B2B sales. Your job is to accurately classify email responses to help sales teams prioritize their follow-ups.

Rules:
1. Be conservative with UNSUBSCRIBE - only use when there's an explicit opt-out request
2. OUT_OF_OFFICE should be used for automated vacation/away messages
3. BOUNCED is for delivery failures, not when someone says they're the wrong contact
4. When in doubt between NOT_NOW and NOT_INTERESTED, lean toward NOT_NOW
5. INTERESTED requires clear signals of wanting to continue the conversation

Always respond with valid JSON. Never include explanations outside the JSON.`;
  }

  /**
   * Parse and validate the AI classification response
   */
  parseClassificationResponse(
    response: AIClassificationResponse,
  ): ClassificationResult {
    // Map string classification to enum
    const classificationMap: Record<string, ClassificationType> = {
      INTERESTED: ClassificationType.INTERESTED,
      NOT_NOW: ClassificationType.NOT_NOW,
      NOT_INTERESTED: ClassificationType.NOT_INTERESTED,
      UNSUBSCRIBE: ClassificationType.UNSUBSCRIBE,
      OUT_OF_OFFICE: ClassificationType.OUT_OF_OFFICE,
      BOUNCED: ClassificationType.BOUNCED,
    };

    const classification =
      classificationMap[response.classification?.toUpperCase()] ||
      ClassificationType.UNKNOWN;

    // Clamp confidence to valid range
    const confidence = Math.min(Math.max(response.confidence || 0, 0), 1);

    return {
      classification,
      confidence,
      reason: response.reason || 'No reason provided',
      metadata: response.metadata,
    };
  }

  /**
   * Check if classification has high confidence
   */
  isHighConfidence(
    result: ClassificationResult,
    threshold: number = this.defaultConfidenceThreshold,
  ): boolean {
    return result.confidence >= threshold;
  }

  /**
   * Check if classification requires a follow-up
   */
  requiresFollowUp(result: ClassificationResult): boolean {
    return result.classification === ClassificationType.NOT_NOW;
  }

  /**
   * Check if campaign should be stopped based on classification
   */
  shouldStopCampaign(result: ClassificationResult): boolean {
    const stopClassifications = [
      ClassificationType.UNSUBSCRIBE,
      ClassificationType.NOT_INTERESTED,
      ClassificationType.BOUNCED,
    ];

    return stopClassifications.includes(result.classification);
  }

  /**
   * Check if campaign should be paused based on classification
   */
  shouldPauseCampaign(result: ClassificationResult): boolean {
    const pauseClassifications = [
      ClassificationType.INTERESTED,
      ClassificationType.OUT_OF_OFFICE,
    ];

    return pauseClassifications.includes(result.classification);
  }

  /**
   * Extract return date from out-of-office message
   */
  async extractOutOfOfficeReturnDate(
    emailContent: string,
  ): Promise<Date | null> {
    try {
      const prompt = `Extract the return date from this out-of-office message. If no specific date is mentioned, respond with null.

Message:
"""
${emailContent}
"""

Respond with JSON: { "returnDate": "YYYY-MM-DD" or null }`;

      const response = await this.openaiService.generateJson<{
        returnDate: string | null;
      }>(prompt);

      if (response.returnDate) {
        const date = new Date(response.returnDate);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }

      return null;
    } catch {
      return null;
    }
  }
}
