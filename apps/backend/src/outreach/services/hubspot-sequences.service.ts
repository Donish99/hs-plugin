import { Injectable, Logger } from '@nestjs/common';
import { Client } from '@hubspot/api-client';
import { OAuthService } from '../../hubspot/services/oauth.service';

export interface SequenceInfo {
  id: string;
  name: string;
  folderName?: string;
  stepCount: number;
  enrollmentCount: number;
  isActive: boolean;
}

export interface EnrollmentRequest {
  contactId: string;
  sequenceId: string;
  senderUserId: string;
  senderEmail?: string;
}

export interface BatchEnrollmentRequest {
  contactIds: string[];
  sequenceId: string;
  senderUserId: string;
  senderEmail?: string;
}

export interface EnrollmentResult {
  success: boolean;
  enrollmentId?: string;
  error?: string;
}

export interface BatchEnrollmentResult {
  successful: number;
  failed: number;
  errors: { contactId: string; error: string }[];
}

export interface UnenrollmentRequest {
  contactId: string;
  sequenceId: string;
}

export interface UnenrollmentResult {
  success: boolean;
  error?: string;
}

export enum EnrollmentStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  UNENROLLED = 'unenrolled',
}

export interface EnrollmentStatusInfo {
  status: EnrollmentStatus;
  currentStep: number;
  totalSteps: number;
  enrolledAt: Date;
  completedAt?: Date;
  pausedAt?: Date;
  pauseReason?: string;
}

export interface SequenceMapping {
  dormancyRuleId: string;
  sequenceId: string;
}

export interface SequenceFetchOptions {
  activeOnly?: boolean;
  limit?: number;
}

/**
 * Service for integrating with HubSpot Sequences
 * Note: Requires HubSpot Professional or Enterprise plan
 */
@Injectable()
export class HubspotSequencesService {
  private readonly logger = new Logger(HubspotSequencesService.name);

  constructor(private readonly oauthService: OAuthService) {}

  /**
   * Check if the account has access to sequences (Pro+ plan)
   */
  async checkSequencesAccess(portalId: number): Promise<boolean> {
    try {
      const plan = await this.oauthService.getAccountPlan(portalId);
      const allowedPlans = ['professional', 'enterprise'];
      return allowedPlans.includes(plan?.toLowerCase() || '');
    } catch (error) {
      this.logger.error(`Failed to check sequences access: ${error}`);
      return false;
    }
  }

  /**
   * Get available sequences from HubSpot
   */
  async getAvailableSequences(
    portalId: number,
    options: SequenceFetchOptions = {},
  ): Promise<SequenceInfo[]> {
    try {
      const accessToken = await this.oauthService.getAccessToken(portalId);
      if (!accessToken) {
        return [];
      }

      const sequences = await this.fetchSequencesFromApi(accessToken);

      if (options.activeOnly) {
        return sequences.filter((s) => s.isActive);
      }

      return sequences;
    } catch (error) {
      this.logger.error(`Failed to fetch sequences: ${error}`);
      return [];
    }
  }

  /**
   * Get a single sequence by ID
   */
  async getSequenceById(
    portalId: number,
    sequenceId: string,
  ): Promise<SequenceInfo | null> {
    try {
      const accessToken = await this.oauthService.getAccessToken(portalId);
      if (!accessToken) {
        return null;
      }

      return await this.fetchSequenceByIdFromApi(accessToken, sequenceId);
    } catch (error) {
      this.logger.error(`Failed to fetch sequence ${sequenceId}: ${error}`);
      return null;
    }
  }

  /**
   * Enroll a contact in a sequence
   */
  async enrollContact(
    portalId: number,
    request: EnrollmentRequest,
  ): Promise<EnrollmentResult> {
    try {
      const accessToken = await this.oauthService.getAccessToken(portalId);
      if (!accessToken) {
        return { success: false, error: 'No access token' };
      }

      // Check if already enrolled
      const isEnrolled = await this.checkExistingEnrollment(
        accessToken,
        request.contactId,
        request.sequenceId,
      );

      if (isEnrolled) {
        return {
          success: false,
          error: 'Contact is already enrolled in this sequence',
        };
      }

      return await this.createEnrollmentInApi(accessToken, request);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to enroll contact: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Enroll multiple contacts in a sequence
   */
  async enrollBatch(
    portalId: number,
    request: BatchEnrollmentRequest,
  ): Promise<BatchEnrollmentResult> {
    const result: BatchEnrollmentResult = {
      successful: 0,
      failed: 0,
      errors: [],
    };

    for (const contactId of request.contactIds) {
      const enrollmentResult = await this.enrollContact(portalId, {
        contactId,
        sequenceId: request.sequenceId,
        senderUserId: request.senderUserId,
        senderEmail: request.senderEmail,
      });

      if (enrollmentResult.success) {
        result.successful++;
      } else {
        result.failed++;
        result.errors.push({
          contactId,
          error: enrollmentResult.error || 'Unknown error',
        });
      }
    }

    this.logger.log(
      `Batch enrollment: ${result.successful} successful, ${result.failed} failed`,
    );

    return result;
  }

  /**
   * Unenroll a contact from a sequence
   */
  async unenrollContact(
    portalId: number,
    request: UnenrollmentRequest,
  ): Promise<UnenrollmentResult> {
    try {
      const accessToken = await this.oauthService.getAccessToken(portalId);
      if (!accessToken) {
        return { success: false, error: 'No access token' };
      }

      return await this.removeEnrollmentFromApi(accessToken, request);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to unenroll contact: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Get enrollment status for a contact in a sequence
   */
  async getEnrollmentStatus(
    portalId: number,
    contactId: string,
    sequenceId: string,
  ): Promise<EnrollmentStatusInfo | null> {
    try {
      const accessToken = await this.oauthService.getAccessToken(portalId);
      if (!accessToken) {
        return null;
      }

      return await this.fetchEnrollmentStatusFromApi(
        accessToken,
        contactId,
        sequenceId,
      );
    } catch (error) {
      this.logger.error(`Failed to get enrollment status: ${error}`);
      return null;
    }
  }

  /**
   * Map a contact to a sequence based on dormancy rule
   */
  mapContactToSequence(
    dormancyRuleId: string,
    mappings: SequenceMapping[],
  ): string | null {
    const mapping = mappings.find((m) => m.dormancyRuleId === dormancyRuleId);
    return mapping?.sequenceId || null;
  }

  /**
   * Fetch sequences from HubSpot API
   * @internal
   */
  private async fetchSequencesFromApi(
    accessToken: string,
  ): Promise<SequenceInfo[]> {
    const client = new Client({ accessToken });

    try {
      // HubSpot Sequences API endpoint
      const response = await client.apiRequest({
        method: 'GET',
        path: '/automation/v3/sequences',
      });

      const data = (await response.json()) as {
        results?: Array<{
          id: string;
          name: string;
          folderName?: string;
          steps?: unknown[];
          enrollmentCount?: number;
          isActive?: boolean;
        }>;
      };

      return (data.results || []).map((seq) => ({
        id: seq.id,
        name: seq.name,
        folderName: seq.folderName,
        stepCount: seq.steps?.length || 0,
        enrollmentCount: seq.enrollmentCount || 0,
        isActive: seq.isActive !== false,
      }));
    } catch (error) {
      this.logger.error(`API error fetching sequences: ${error}`);
      throw error;
    }
  }

  /**
   * Fetch a single sequence by ID from HubSpot API
   * @internal
   */
  private async fetchSequenceByIdFromApi(
    accessToken: string,
    sequenceId: string,
  ): Promise<SequenceInfo | null> {
    const client = new Client({ accessToken });

    try {
      const response = await client.apiRequest({
        method: 'GET',
        path: `/automation/v3/sequences/${sequenceId}`,
      });

      const seq = (await response.json()) as {
        id: string;
        name: string;
        folderName?: string;
        steps?: unknown[];
        enrollmentCount?: number;
        isActive?: boolean;
      };

      return {
        id: seq.id,
        name: seq.name,
        folderName: seq.folderName,
        stepCount: seq.steps?.length || 0,
        enrollmentCount: seq.enrollmentCount || 0,
        isActive: seq.isActive !== false,
      };
    } catch (error) {
      this.logger.error(`API error fetching sequence ${sequenceId}: ${error}`);
      return null;
    }
  }

  /**
   * Check if contact is already enrolled in a sequence
   * @internal
   */
  private async checkExistingEnrollment(
    accessToken: string,
    contactId: string,
    sequenceId: string,
  ): Promise<boolean> {
    const client = new Client({ accessToken });

    try {
      const response = await client.apiRequest({
        method: 'GET',
        path: `/automation/v3/sequences/${sequenceId}/enrollments`,
        qs: { contactId },
      });

      const data = (await response.json()) as { results?: unknown[] };
      return (data.results?.length || 0) > 0;
    } catch {
      return false;
    }
  }

  /**
   * Create enrollment via HubSpot API
   * @internal
   */
  private async createEnrollmentInApi(
    accessToken: string,
    request: EnrollmentRequest,
  ): Promise<EnrollmentResult> {
    const client = new Client({ accessToken });

    try {
      const response = await client.apiRequest({
        method: 'POST',
        path: `/automation/v3/sequences/${request.sequenceId}/enrollments`,
        body: {
          contactId: request.contactId,
          userId: request.senderUserId,
          senderEmail: request.senderEmail,
        },
      });

      const data = (await response.json()) as { id?: string };

      return {
        success: true,
        enrollmentId: data.id,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Enrollment failed';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Remove enrollment via HubSpot API
   * @internal
   */
  private async removeEnrollmentFromApi(
    accessToken: string,
    request: UnenrollmentRequest,
  ): Promise<UnenrollmentResult> {
    const client = new Client({ accessToken });

    try {
      await client.apiRequest({
        method: 'DELETE',
        path: `/automation/v3/sequences/${request.sequenceId}/enrollments/${request.contactId}`,
      });

      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unenrollment failed';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Fetch enrollment status from HubSpot API
   * @internal
   */
  private async fetchEnrollmentStatusFromApi(
    accessToken: string,
    contactId: string,
    sequenceId: string,
  ): Promise<EnrollmentStatusInfo | null> {
    const client = new Client({ accessToken });

    try {
      const response = await client.apiRequest({
        method: 'GET',
        path: `/automation/v3/sequences/${sequenceId}/enrollments/${contactId}`,
      });

      const data = (await response.json()) as {
        status?: string;
        currentStep?: number;
        totalSteps?: number;
        enrolledAt?: string;
        completedAt?: string;
        pausedAt?: string;
        pauseReason?: string;
      };

      return {
        status: (data.status as EnrollmentStatus) || EnrollmentStatus.ACTIVE,
        currentStep: data.currentStep || 0,
        totalSteps: data.totalSteps || 0,
        enrolledAt: new Date(data.enrolledAt || Date.now()),
        completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
        pausedAt: data.pausedAt ? new Date(data.pausedAt) : undefined,
        pauseReason: data.pauseReason,
      };
    } catch {
      return null;
    }
  }
}
