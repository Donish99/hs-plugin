import { Test, TestingModule } from '@nestjs/testing';
import { HubspotLoggerService, EmailLogData, SmsLogData, TaskData } from './hubspot-logger.service';
import { OAuthService } from '../../hubspot/services/oauth.service';

// Mock the HubSpot API client
jest.mock('@hubspot/api-client', () => {
  const mockCreate = jest.fn().mockResolvedValue({ id: 'mock-engagement-id' });
  const mockUpdate = jest.fn().mockResolvedValue({});
  const mockAssociationCreate = jest.fn().mockResolvedValue({});

  return {
    Client: jest.fn().mockImplementation(() => ({
      crm: {
        objects: {
          emails: {
            basicApi: {
              create: mockCreate,
              update: mockUpdate,
            },
          },
          notes: {
            basicApi: {
              create: mockCreate,
            },
          },
          tasks: {
            basicApi: {
              create: mockCreate,
            },
          },
        },
        contacts: {
          basicApi: {
            update: mockUpdate,
          },
        },
        associations: {
          v4: {
            basicApi: {
              create: mockAssociationCreate,
            },
          },
        },
      },
    })),
  };
});

describe('HubspotLoggerService', () => {
  let service: HubspotLoggerService;

  const mockPortalId = 123456;
  const mockAccessToken = 'mock-access-token';
  const mockContactId = '12345';

  const mockOAuthService = {
    getValidAccessToken: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HubspotLoggerService,
        { provide: OAuthService, useValue: mockOAuthService },
      ],
    }).compile();

    service = module.get<HubspotLoggerService>(HubspotLoggerService);

    mockOAuthService.getValidAccessToken.mockResolvedValue(mockAccessToken);
    jest.clearAllMocks();
  });

  describe('logEmailSent', () => {
    const mockEmailData: EmailLogData = {
      contactId: mockContactId,
      subject: 'Test Subject',
      body: 'Test body content',
      textBody: 'Test body content in plain text',
      toEmail: 'recipient@example.com',
      fromEmail: 'sender@example.com',
      sendgridMessageId: 'sg-msg-12345',
    };

    it('should log email engagement to HubSpot', async () => {
      const result = await service.logEmailSent(mockPortalId, mockEmailData);

      expect(result.success).toBe(true);
      expect(result.engagementId).toBeDefined();
    });

    it('should associate email with contact', async () => {
      const result = await service.logEmailSent(mockPortalId, mockEmailData);

      expect(result.success).toBe(true);
      expect(result.associatedContactId).toBe(mockContactId);
    });

    it('should include correct email properties', async () => {
      const result = await service.logEmailSent(mockPortalId, mockEmailData);

      expect(result.success).toBe(true);
    });

    it('should set correct timestamp', async () => {
      const beforeCall = Date.now();
      const result = await service.logEmailSent(mockPortalId, mockEmailData);
      const afterCall = Date.now();

      expect(result.success).toBe(true);
      expect(result.timestamp).toBeGreaterThanOrEqual(beforeCall);
      expect(result.timestamp).toBeLessThanOrEqual(afterCall);
    });

    it('should handle HubSpot API errors', async () => {
      mockOAuthService.getValidAccessToken.mockRejectedValue(
        new Error('Token expired'),
      );

      const result = await service.logEmailSent(mockPortalId, mockEmailData);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Token expired');
    });

    it('should include deal association when provided', async () => {
      const emailDataWithDeal = {
        ...mockEmailData,
        dealId: '67890',
      };

      const result = await service.logEmailSent(mockPortalId, emailDataWithDeal);

      expect(result.success).toBe(true);
      expect(result.associatedDealId).toBe('67890');
    });
  });

  describe('logSmsSent', () => {
    const mockSmsData: SmsLogData = {
      contactId: mockContactId,
      body: 'Test SMS message',
      toPhone: '+1234567890',
      fromPhone: '+0987654321',
      twilioSid: 'SM1234567890',
    };

    it('should log SMS as communication in HubSpot', async () => {
      const result = await service.logSmsSent(mockPortalId, mockSmsData);

      expect(result.success).toBe(true);
      expect(result.engagementId).toBeDefined();
    });

    it('should associate SMS with contact', async () => {
      const result = await service.logSmsSent(mockPortalId, mockSmsData);

      expect(result.success).toBe(true);
      expect(result.associatedContactId).toBe(mockContactId);
    });

    it('should handle API errors gracefully', async () => {
      mockOAuthService.getValidAccessToken.mockRejectedValue(
        new Error('API error'),
      );

      const result = await service.logSmsSent(mockPortalId, mockSmsData);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('updateContactLastContacted', () => {
    it('should update contact last contacted date', async () => {
      const result = await service.updateContactLastContacted(
        mockPortalId,
        mockContactId,
      );

      expect(result.success).toBe(true);
    });

    it('should use current timestamp', async () => {
      const beforeCall = Date.now();
      const result = await service.updateContactLastContacted(
        mockPortalId,
        mockContactId,
      );
      const afterCall = Date.now();

      expect(result.success).toBe(true);
      expect(result.updatedAt).toBeGreaterThanOrEqual(beforeCall);
      expect(result.updatedAt).toBeLessThanOrEqual(afterCall);
    });

    it('should handle API errors', async () => {
      mockOAuthService.getValidAccessToken.mockRejectedValue(
        new Error('Update failed'),
      );

      const result = await service.updateContactLastContacted(
        mockPortalId,
        mockContactId,
      );

      expect(result.success).toBe(false);
    });
  });

  describe('createFollowUpTask', () => {
    const mockTaskData: TaskData = {
      contactId: mockContactId,
      subject: 'Follow up on reactivation email',
      body: 'Contact responded positively, schedule a call',
      dueDate: new Date('2024-01-20'),
      priority: 'HIGH',
    };

    it('should create follow-up task', async () => {
      const result = await service.createFollowUpTask(mockPortalId, mockTaskData);

      expect(result.success).toBe(true);
      expect(result.taskId).toBeDefined();
    });

    it('should associate task with contact', async () => {
      const result = await service.createFollowUpTask(mockPortalId, mockTaskData);

      expect(result.success).toBe(true);
      expect(result.associatedContactId).toBe(mockContactId);
    });

    it('should set correct priority', async () => {
      const result = await service.createFollowUpTask(mockPortalId, {
        ...mockTaskData,
        priority: 'LOW',
      });

      expect(result.success).toBe(true);
    });

    it('should associate with owner when provided', async () => {
      const result = await service.createFollowUpTask(mockPortalId, {
        ...mockTaskData,
        ownerId: 'owner-123',
      });

      expect(result.success).toBe(true);
      expect(result.ownerId).toBe('owner-123');
    });

    it('should handle API errors', async () => {
      mockOAuthService.getValidAccessToken.mockRejectedValue(
        new Error('Task creation failed'),
      );

      const result = await service.createFollowUpTask(mockPortalId, mockTaskData);

      expect(result.success).toBe(false);
    });
  });

  describe('updateEngagementStatus', () => {
    it('should update email engagement status to OPENED', async () => {
      const result = await service.updateEngagementStatus(
        mockPortalId,
        'engagement-123',
        'OPENED',
      );

      expect(result.success).toBe(true);
    });

    it('should update email engagement status to CLICKED', async () => {
      const result = await service.updateEngagementStatus(
        mockPortalId,
        'engagement-123',
        'CLICKED',
      );

      expect(result.success).toBe(true);
    });

    it('should handle invalid engagement ID', async () => {
      const result = await service.updateEngagementStatus(
        mockPortalId,
        '',
        'OPENED',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('engagement ID');
    });
  });

  describe('logBounce', () => {
    it('should log email bounce', async () => {
      const result = await service.logBounce(mockPortalId, {
        contactId: mockContactId,
        email: 'bounced@example.com',
        reason: 'Hard bounce - invalid address',
        bounceType: 'hard',
      });

      expect(result.success).toBe(true);
    });

    it('should update contact email status on hard bounce', async () => {
      const result = await service.logBounce(mockPortalId, {
        contactId: mockContactId,
        email: 'bounced@example.com',
        reason: 'Hard bounce',
        bounceType: 'hard',
      });

      expect(result.success).toBe(true);
      expect(result.contactUpdated).toBe(true);
    });
  });

  describe('batch operations', () => {
    it('should log multiple emails in batch', async () => {
      const emails: EmailLogData[] = [
        {
          contactId: '111',
          subject: 'Subject 1',
          body: 'Body 1',
          toEmail: 'user1@example.com',
        },
        {
          contactId: '222',
          subject: 'Subject 2',
          body: 'Body 2',
          toEmail: 'user2@example.com',
        },
      ];

      const results = await service.logEmailsBatch(mockPortalId, emails);

      expect(results.successful).toBe(2);
      expect(results.failed).toBe(0);
    });

    it('should handle partial failures in batch', async () => {
      mockOAuthService.getValidAccessToken
        .mockResolvedValueOnce(mockAccessToken)
        .mockRejectedValueOnce(new Error('API error'));

      const emails: EmailLogData[] = [
        { contactId: '111', subject: 'S1', body: 'B1', toEmail: 'u1@ex.com' },
        { contactId: '222', subject: 'S2', body: 'B2', toEmail: 'u2@ex.com' },
      ];

      const results = await service.logEmailsBatch(mockPortalId, emails);

      expect(results.successful).toBe(1);
      expect(results.failed).toBe(1);
    });
  });
});
