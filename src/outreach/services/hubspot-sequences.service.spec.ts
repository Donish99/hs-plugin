import { Test, TestingModule } from '@nestjs/testing';
import {
  HubspotSequencesService,
  SequenceInfo,
  EnrollmentResult,
  EnrollmentStatus,
} from './hubspot-sequences.service';
import { OAuthService } from '../../hubspot/services/oauth.service';

// Mock the HubSpot client
jest.mock('@hubspot/api-client', () => ({
  Client: jest.fn().mockImplementation(() => ({
    automation: {
      sequencesApi: {
        getPage: jest.fn(),
        getById: jest.fn(),
      },
    },
    crm: {
      objects: {
        basicApi: {
          create: jest.fn(),
          getById: jest.fn(),
        },
        searchApi: {
          doSearch: jest.fn(),
        },
      },
    },
    apiRequest: jest.fn(),
  })),
}));

describe('HubspotSequencesService', () => {
  let service: HubspotSequencesService;
  let oauthService: jest.Mocked<OAuthService>;

  const mockPortalId = 123456;

  const mockSequences: SequenceInfo[] = [
    {
      id: 'seq-1',
      name: 'Reactivation Sequence 1',
      folderName: 'Sales',
      stepCount: 5,
      enrollmentCount: 100,
      isActive: true,
    },
    {
      id: 'seq-2',
      name: 'Follow-up Sequence',
      folderName: 'Marketing',
      stepCount: 3,
      enrollmentCount: 50,
      isActive: true,
    },
  ];

  const mockOAuthService = {
    getAccessToken: jest.fn(),
    getAccountPlan: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HubspotSequencesService,
        { provide: OAuthService, useValue: mockOAuthService },
      ],
    }).compile();

    service = module.get<HubspotSequencesService>(HubspotSequencesService);
    oauthService = module.get(OAuthService);

    jest.clearAllMocks();
  });

  describe('checkSequencesAccess', () => {
    it('should return true for Professional plan', async () => {
      mockOAuthService.getAccountPlan.mockResolvedValue('professional');

      const hasAccess = await service.checkSequencesAccess(mockPortalId);

      expect(hasAccess).toBe(true);
    });

    it('should return true for Enterprise plan', async () => {
      mockOAuthService.getAccountPlan.mockResolvedValue('enterprise');

      const hasAccess = await service.checkSequencesAccess(mockPortalId);

      expect(hasAccess).toBe(true);
    });

    it('should return false for Starter plan', async () => {
      mockOAuthService.getAccountPlan.mockResolvedValue('starter');

      const hasAccess = await service.checkSequencesAccess(mockPortalId);

      expect(hasAccess).toBe(false);
    });

    it('should return false for Free plan', async () => {
      mockOAuthService.getAccountPlan.mockResolvedValue('free');

      const hasAccess = await service.checkSequencesAccess(mockPortalId);

      expect(hasAccess).toBe(false);
    });

    it('should handle errors gracefully', async () => {
      mockOAuthService.getAccountPlan.mockRejectedValue(new Error('API error'));

      const hasAccess = await service.checkSequencesAccess(mockPortalId);

      expect(hasAccess).toBe(false);
    });
  });

  describe('getAvailableSequences', () => {
    it('should fetch sequences from HubSpot', async () => {
      mockOAuthService.getAccessToken.mockResolvedValue('test-token');
      jest.spyOn(service as any, 'fetchSequencesFromApi').mockResolvedValue(mockSequences);

      const sequences = await service.getAvailableSequences(mockPortalId);

      expect(sequences).toHaveLength(2);
      expect(sequences[0].name).toBe('Reactivation Sequence 1');
    });

    it('should filter only active sequences', async () => {
      mockOAuthService.getAccessToken.mockResolvedValue('test-token');
      const sequencesWithInactive = [
        ...mockSequences,
        { ...mockSequences[0], id: 'seq-3', isActive: false },
      ];
      jest.spyOn(service as any, 'fetchSequencesFromApi').mockResolvedValue(sequencesWithInactive);

      const sequences = await service.getAvailableSequences(mockPortalId, { activeOnly: true });

      expect(sequences).toHaveLength(2);
      expect(sequences.every(s => s.isActive)).toBe(true);
    });

    it('should return empty array when no access token', async () => {
      mockOAuthService.getAccessToken.mockResolvedValue(null);

      const sequences = await service.getAvailableSequences(mockPortalId);

      expect(sequences).toEqual([]);
    });

    it('should handle API errors gracefully', async () => {
      mockOAuthService.getAccessToken.mockResolvedValue('test-token');
      jest.spyOn(service as any, 'fetchSequencesFromApi').mockRejectedValue(new Error('API error'));

      const sequences = await service.getAvailableSequences(mockPortalId);

      expect(sequences).toEqual([]);
    });
  });

  describe('getSequenceById', () => {
    it('should fetch a single sequence by ID', async () => {
      mockOAuthService.getAccessToken.mockResolvedValue('test-token');
      jest.spyOn(service as any, 'fetchSequenceByIdFromApi').mockResolvedValue(mockSequences[0]);

      const sequence = await service.getSequenceById(mockPortalId, 'seq-1');

      expect(sequence).toBeDefined();
      expect(sequence?.id).toBe('seq-1');
    });

    it('should return null for non-existent sequence', async () => {
      mockOAuthService.getAccessToken.mockResolvedValue('test-token');
      jest.spyOn(service as any, 'fetchSequenceByIdFromApi').mockResolvedValue(null);

      const sequence = await service.getSequenceById(mockPortalId, 'non-existent');

      expect(sequence).toBeNull();
    });
  });

  describe('enrollContact', () => {
    it('should enroll a contact in a sequence successfully', async () => {
      mockOAuthService.getAccessToken.mockResolvedValue('test-token');
      jest.spyOn(service as any, 'createEnrollmentInApi').mockResolvedValue({
        success: true,
        enrollmentId: 'enroll-123',
      });

      const result = await service.enrollContact(mockPortalId, {
        contactId: 'contact-123',
        sequenceId: 'seq-1',
        senderUserId: 'user-456',
      });

      expect(result.success).toBe(true);
      expect(result.enrollmentId).toBe('enroll-123');
    });

    it('should fail when contact is already enrolled', async () => {
      mockOAuthService.getAccessToken.mockResolvedValue('test-token');
      jest.spyOn(service as any, 'checkExistingEnrollment').mockResolvedValue(true);

      const result = await service.enrollContact(mockPortalId, {
        contactId: 'contact-123',
        sequenceId: 'seq-1',
        senderUserId: 'user-456',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('already enrolled');
    });

    it('should fail when sender email is missing', async () => {
      mockOAuthService.getAccessToken.mockResolvedValue('test-token');
      jest.spyOn(service as any, 'checkExistingEnrollment').mockResolvedValue(false);
      jest.spyOn(service as any, 'createEnrollmentInApi').mockResolvedValue({
        success: false,
        error: 'Sender email required',
      });

      const result = await service.enrollContact(mockPortalId, {
        contactId: 'contact-123',
        sequenceId: 'seq-1',
        senderUserId: 'user-456',
      });

      expect(result.success).toBe(false);
    });

    it('should handle enrollment API errors', async () => {
      mockOAuthService.getAccessToken.mockResolvedValue('test-token');
      jest.spyOn(service as any, 'checkExistingEnrollment').mockResolvedValue(false);
      jest.spyOn(service as any, 'createEnrollmentInApi').mockRejectedValue(new Error('API error'));

      const result = await service.enrollContact(mockPortalId, {
        contactId: 'contact-123',
        sequenceId: 'seq-1',
        senderUserId: 'user-456',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('API error');
    });
  });

  describe('enrollBatch', () => {
    it('should enroll multiple contacts', async () => {
      mockOAuthService.getAccessToken.mockResolvedValue('test-token');
      jest.spyOn(service as any, 'checkExistingEnrollment').mockResolvedValue(false);
      jest.spyOn(service as any, 'createEnrollmentInApi').mockResolvedValue({
        success: true,
        enrollmentId: 'enroll-123',
      });

      const result = await service.enrollBatch(mockPortalId, {
        contactIds: ['contact-1', 'contact-2', 'contact-3'],
        sequenceId: 'seq-1',
        senderUserId: 'user-456',
      });

      expect(result.successful).toBe(3);
      expect(result.failed).toBe(0);
    });

    it('should track failures in batch enrollment', async () => {
      mockOAuthService.getAccessToken.mockResolvedValue('test-token');
      jest.spyOn(service as any, 'checkExistingEnrollment').mockResolvedValue(false);
      jest.spyOn(service as any, 'createEnrollmentInApi')
        .mockResolvedValueOnce({ success: true, enrollmentId: 'enroll-1' })
        .mockResolvedValueOnce({ success: false, error: 'Failed' })
        .mockResolvedValueOnce({ success: true, enrollmentId: 'enroll-3' });

      const result = await service.enrollBatch(mockPortalId, {
        contactIds: ['contact-1', 'contact-2', 'contact-3'],
        sequenceId: 'seq-1',
        senderUserId: 'user-456',
      });

      expect(result.successful).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('unenrollContact', () => {
    it('should unenroll a contact from a sequence', async () => {
      mockOAuthService.getAccessToken.mockResolvedValue('test-token');
      jest.spyOn(service as any, 'removeEnrollmentFromApi').mockResolvedValue({ success: true });

      const result = await service.unenrollContact(mockPortalId, {
        contactId: 'contact-123',
        sequenceId: 'seq-1',
      });

      expect(result.success).toBe(true);
    });

    it('should handle unenrollment when not enrolled', async () => {
      mockOAuthService.getAccessToken.mockResolvedValue('test-token');
      jest.spyOn(service as any, 'removeEnrollmentFromApi').mockResolvedValue({
        success: false,
        error: 'Contact not enrolled',
      });

      const result = await service.unenrollContact(mockPortalId, {
        contactId: 'contact-123',
        sequenceId: 'seq-1',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('getEnrollmentStatus', () => {
    it('should return enrollment status for a contact', async () => {
      mockOAuthService.getAccessToken.mockResolvedValue('test-token');
      jest.spyOn(service as any, 'fetchEnrollmentStatusFromApi').mockResolvedValue({
        status: EnrollmentStatus.ACTIVE,
        currentStep: 2,
        totalSteps: 5,
        enrolledAt: new Date('2024-01-15'),
      });

      const status = await service.getEnrollmentStatus(mockPortalId, 'contact-123', 'seq-1');

      expect(status).toBeDefined();
      expect(status?.status).toBe(EnrollmentStatus.ACTIVE);
      expect(status?.currentStep).toBe(2);
    });

    it('should return null when not enrolled', async () => {
      mockOAuthService.getAccessToken.mockResolvedValue('test-token');
      jest.spyOn(service as any, 'fetchEnrollmentStatusFromApi').mockResolvedValue(null);

      const status = await service.getEnrollmentStatus(mockPortalId, 'contact-123', 'seq-1');

      expect(status).toBeNull();
    });

    it('should track completed status', async () => {
      mockOAuthService.getAccessToken.mockResolvedValue('test-token');
      jest.spyOn(service as any, 'fetchEnrollmentStatusFromApi').mockResolvedValue({
        status: EnrollmentStatus.COMPLETED,
        currentStep: 5,
        totalSteps: 5,
        enrolledAt: new Date('2024-01-15'),
        completedAt: new Date('2024-01-20'),
      });

      const status = await service.getEnrollmentStatus(mockPortalId, 'contact-123', 'seq-1');

      expect(status?.status).toBe(EnrollmentStatus.COMPLETED);
      expect(status?.completedAt).toBeDefined();
    });

    it('should track paused status', async () => {
      mockOAuthService.getAccessToken.mockResolvedValue('test-token');
      jest.spyOn(service as any, 'fetchEnrollmentStatusFromApi').mockResolvedValue({
        status: EnrollmentStatus.PAUSED,
        currentStep: 3,
        totalSteps: 5,
        enrolledAt: new Date('2024-01-15'),
        pausedAt: new Date('2024-01-18'),
        pauseReason: 'Manual pause',
      });

      const status = await service.getEnrollmentStatus(mockPortalId, 'contact-123', 'seq-1');

      expect(status?.status).toBe(EnrollmentStatus.PAUSED);
      expect(status?.pauseReason).toBe('Manual pause');
    });
  });

  describe('mapContactToSequence', () => {
    it('should map contact based on dormancy rule criteria', async () => {
      const sequenceMapping = [
        { dormancyRuleId: 'rule-1', sequenceId: 'seq-1' },
        { dormancyRuleId: 'rule-2', sequenceId: 'seq-2' },
      ];

      const result = service.mapContactToSequence('rule-1', sequenceMapping);

      expect(result).toBe('seq-1');
    });

    it('should return null when no mapping exists', () => {
      const sequenceMapping = [
        { dormancyRuleId: 'rule-1', sequenceId: 'seq-1' },
      ];

      const result = service.mapContactToSequence('rule-3', sequenceMapping);

      expect(result).toBeNull();
    });

    it('should handle empty mapping', () => {
      const result = service.mapContactToSequence('rule-1', []);

      expect(result).toBeNull();
    });
  });
});
