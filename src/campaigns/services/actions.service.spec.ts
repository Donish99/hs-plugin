import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ActionsService,
  ActionType,
  ActionResult,
} from './actions.service';
import {
  ClassificationType,
  ClassificationResult,
} from '../../ai/services/classifier.service';
import { HubspotLoggerService } from '../../outreach/services/hubspot-logger.service';
import { CampaignService } from './campaign.service';
import { OutreachRecord, OutreachStatus } from '../../entities/outreach-record.entity';
import { Campaign, CampaignStatus } from '../../entities/campaign.entity';

describe('ActionsService', () => {
  let service: ActionsService;
  let hubspotLogger: jest.Mocked<HubspotLoggerService>;
  let campaignService: jest.Mocked<CampaignService>;
  let outreachRepository: jest.Mocked<Repository<OutreachRecord>>;
  let campaignRepository: jest.Mocked<Repository<Campaign>>;

  const mockPortalId = 12345;
  const mockContactId = 'contact-123';
  const mockCampaignId = 'campaign-123';

  const mockHubspotLogger = {
    createFollowUpTask: jest.fn(),
    updateContactLastContacted: jest.fn(),
    logBounce: jest.fn(),
  };

  const mockCampaignService = {
    pauseCampaign: jest.fn(),
    stopCampaign: jest.fn(),
    updateCampaignStatus: jest.fn(),
  };

  const mockOutreachRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };

  const mockCampaignRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActionsService,
        { provide: HubspotLoggerService, useValue: mockHubspotLogger },
        { provide: CampaignService, useValue: mockCampaignService },
        { provide: getRepositoryToken(OutreachRecord), useValue: mockOutreachRepository },
        { provide: getRepositoryToken(Campaign), useValue: mockCampaignRepository },
      ],
    }).compile();

    service = module.get<ActionsService>(ActionsService);
    hubspotLogger = module.get(HubspotLoggerService);
    campaignService = module.get(CampaignService);
    outreachRepository = module.get(getRepositoryToken(OutreachRecord));
    campaignRepository = module.get(getRepositoryToken(Campaign));

    jest.clearAllMocks();
  });

  describe('executeAction', () => {
    describe('INTERESTED classification', () => {
      const classification: ClassificationResult = {
        classification: ClassificationType.INTERESTED,
        confidence: 0.95,
        reason: 'User wants to schedule a call',
      };

      it('should create task for sales rep', async () => {
        mockOutreachRepository.findOne.mockResolvedValue({
          id: 'outreach-1',
          campaignId: mockCampaignId,
          hubspotContactId: 12345,
        });
        mockHubspotLogger.createFollowUpTask.mockResolvedValue({ success: true });
        mockCampaignService.pauseCampaign.mockResolvedValue({ success: true });

        const result = await service.executeAction({
          portalId: mockPortalId,
          contactId: mockContactId,
          outreachId: 'outreach-1',
          classification,
        });

        expect(result.actionsExecuted).toContain(ActionType.CREATE_TASK);
        expect(mockHubspotLogger.createFollowUpTask).toHaveBeenCalled();
      });

      it('should pause the campaign', async () => {
        mockOutreachRepository.findOne.mockResolvedValue({
          id: 'outreach-1',
          campaignId: mockCampaignId,
          hubspotContactId: 12345,
        });
        mockHubspotLogger.createFollowUpTask.mockResolvedValue({ success: true });
        mockCampaignService.pauseCampaign.mockResolvedValue({ success: true });

        const result = await service.executeAction({
          portalId: mockPortalId,
          contactId: mockContactId,
          outreachId: 'outreach-1',
          classification,
        });

        expect(result.actionsExecuted).toContain(ActionType.PAUSE_CAMPAIGN);
      });
    });

    describe('NOT_NOW classification', () => {
      const classification: ClassificationResult = {
        classification: ClassificationType.NOT_NOW,
        confidence: 0.88,
        reason: 'Timing not right, check back in Q2',
      };

      it('should schedule follow-up', async () => {
        mockOutreachRepository.findOne.mockResolvedValue({
          id: 'outreach-1',
          campaignId: mockCampaignId,
        });
        mockOutreachRepository.save.mockImplementation(async (r) => r);

        const result = await service.executeAction({
          portalId: mockPortalId,
          contactId: mockContactId,
          outreachId: 'outreach-1',
          classification,
        });

        expect(result.actionsExecuted).toContain(ActionType.SCHEDULE_FOLLOWUP);
      });

      it('should not stop the campaign', async () => {
        mockOutreachRepository.findOne.mockResolvedValue({
          id: 'outreach-1',
          campaignId: mockCampaignId,
        });
        mockOutreachRepository.save.mockImplementation(async (r) => r);

        const result = await service.executeAction({
          portalId: mockPortalId,
          contactId: mockContactId,
          outreachId: 'outreach-1',
          classification,
        });

        expect(result.actionsExecuted).not.toContain(ActionType.STOP_CAMPAIGN);
      });
    });

    describe('NOT_INTERESTED classification', () => {
      const classification: ClassificationResult = {
        classification: ClassificationType.NOT_INTERESTED,
        confidence: 0.92,
        reason: 'Polite decline',
      };

      it('should stop the campaign', async () => {
        mockOutreachRepository.findOne.mockResolvedValue({
          id: 'outreach-1',
          campaignId: mockCampaignId,
        });
        mockCampaignService.stopCampaign.mockResolvedValue({ success: true });
        mockOutreachRepository.save.mockImplementation(async (r) => r);

        const result = await service.executeAction({
          portalId: mockPortalId,
          contactId: mockContactId,
          outreachId: 'outreach-1',
          classification,
        });

        expect(result.actionsExecuted).toContain(ActionType.STOP_CAMPAIGN);
      });

      it('should mark contact appropriately', async () => {
        mockOutreachRepository.findOne.mockResolvedValue({
          id: 'outreach-1',
          campaignId: mockCampaignId,
        });
        mockCampaignService.stopCampaign.mockResolvedValue({ success: true });
        mockOutreachRepository.save.mockImplementation(async (r) => r);

        const result = await service.executeAction({
          portalId: mockPortalId,
          contactId: mockContactId,
          outreachId: 'outreach-1',
          classification,
        });

        expect(result.actionsExecuted).toContain(ActionType.MARK_CONTACT);
      });
    });

    describe('UNSUBSCRIBE classification', () => {
      const classification: ClassificationResult = {
        classification: ClassificationType.UNSUBSCRIBE,
        confidence: 0.99,
        reason: 'Explicit unsubscribe request',
      };

      it('should remove from all campaigns', async () => {
        mockOutreachRepository.findOne.mockResolvedValue({
          id: 'outreach-1',
          campaignId: mockCampaignId,
          accountId: 'account-123',
        });
        mockOutreachRepository.find.mockResolvedValue([
          { id: 'outreach-1', campaignId: 'campaign-1' },
          { id: 'outreach-2', campaignId: 'campaign-2' },
        ]);
        mockOutreachRepository.update.mockResolvedValue({ affected: 2 });

        const result = await service.executeAction({
          portalId: mockPortalId,
          contactId: mockContactId,
          outreachId: 'outreach-1',
          classification,
        });

        expect(result.actionsExecuted).toContain(ActionType.REMOVE_FROM_ALL_CAMPAIGNS);
      });

      it('should add to suppression list', async () => {
        mockOutreachRepository.findOne.mockResolvedValue({
          id: 'outreach-1',
          campaignId: mockCampaignId,
          accountId: 'account-123',
        });
        mockOutreachRepository.find.mockResolvedValue([]);
        mockOutreachRepository.update.mockResolvedValue({ affected: 0 });

        const result = await service.executeAction({
          portalId: mockPortalId,
          contactId: mockContactId,
          outreachId: 'outreach-1',
          classification,
        });

        expect(result.actionsExecuted).toContain(ActionType.ADD_TO_SUPPRESSION);
      });
    });

    describe('OUT_OF_OFFICE classification', () => {
      const classification: ClassificationResult = {
        classification: ClassificationType.OUT_OF_OFFICE,
        confidence: 0.97,
        reason: 'Automated OOO message',
        metadata: { returnDate: '2024-02-15' },
      };

      it('should reschedule based on return date', async () => {
        mockOutreachRepository.findOne.mockResolvedValue({
          id: 'outreach-1',
          campaignId: mockCampaignId,
        });
        mockOutreachRepository.save.mockImplementation(async (r) => r);
        mockCampaignService.pauseCampaign.mockResolvedValue({ success: true });

        const result = await service.executeAction({
          portalId: mockPortalId,
          contactId: mockContactId,
          outreachId: 'outreach-1',
          classification,
        });

        expect(result.actionsExecuted).toContain(ActionType.RESCHEDULE);
      });

      it('should pause the campaign temporarily', async () => {
        mockOutreachRepository.findOne.mockResolvedValue({
          id: 'outreach-1',
          campaignId: mockCampaignId,
        });
        mockOutreachRepository.save.mockImplementation(async (r) => r);
        mockCampaignService.pauseCampaign.mockResolvedValue({ success: true });

        const result = await service.executeAction({
          portalId: mockPortalId,
          contactId: mockContactId,
          outreachId: 'outreach-1',
          classification,
        });

        expect(result.actionsExecuted).toContain(ActionType.PAUSE_CAMPAIGN);
      });
    });

    describe('BOUNCED classification', () => {
      const classification: ClassificationResult = {
        classification: ClassificationType.BOUNCED,
        confidence: 0.99,
        reason: 'Delivery failure',
      };

      it('should mark email as invalid in HubSpot', async () => {
        mockOutreachRepository.findOne.mockResolvedValue({
          id: 'outreach-1',
          campaignId: mockCampaignId,
          contactEmail: 'invalid@example.com',
          hubspotContactId: 12345,
        });
        mockHubspotLogger.logBounce.mockResolvedValue({ success: true });
        mockOutreachRepository.save.mockImplementation(async (r) => r);

        const result = await service.executeAction({
          portalId: mockPortalId,
          contactId: mockContactId,
          outreachId: 'outreach-1',
          classification,
        });

        expect(result.actionsExecuted).toContain(ActionType.MARK_EMAIL_INVALID);
        expect(mockHubspotLogger.logBounce).toHaveBeenCalled();
      });

      it('should stop outreach for this contact', async () => {
        mockOutreachRepository.findOne.mockResolvedValue({
          id: 'outreach-1',
          campaignId: mockCampaignId,
          contactEmail: 'invalid@example.com',
          hubspotContactId: 12345,
        });
        mockHubspotLogger.logBounce.mockResolvedValue({ success: true });
        mockOutreachRepository.save.mockImplementation(async (r) => r);

        const result = await service.executeAction({
          portalId: mockPortalId,
          contactId: mockContactId,
          outreachId: 'outreach-1',
          classification,
        });

        expect(result.actionsExecuted).toContain(ActionType.STOP_CAMPAIGN);
      });
    });
  });

  describe('getActionsForClassification', () => {
    it('should return correct actions for INTERESTED', () => {
      const actions = service.getActionsForClassification(ClassificationType.INTERESTED);

      expect(actions).toContain(ActionType.CREATE_TASK);
      expect(actions).toContain(ActionType.PAUSE_CAMPAIGN);
    });

    it('should return correct actions for UNSUBSCRIBE', () => {
      const actions = service.getActionsForClassification(ClassificationType.UNSUBSCRIBE);

      expect(actions).toContain(ActionType.REMOVE_FROM_ALL_CAMPAIGNS);
      expect(actions).toContain(ActionType.ADD_TO_SUPPRESSION);
    });
  });

  describe('addToSuppressionList', () => {
    it('should add contact to suppression list', async () => {
      mockOutreachRepository.findOne.mockResolvedValue({
        id: 'outreach-1',
        accountId: 'account-123',
      });

      const result = await service.addToSuppressionList(
        'account-123',
        mockContactId,
        'unsubscribe',
      );

      expect(result.success).toBe(true);
    });
  });

  describe('isInSuppressionList', () => {
    it('should check if contact is suppressed', async () => {
      const isSuppressed = await service.isInSuppressionList(
        'account-123',
        mockContactId,
      );

      expect(typeof isSuppressed).toBe('boolean');
    });
  });

  describe('scheduleFollowUp', () => {
    it('should schedule follow-up for future date', async () => {
      mockOutreachRepository.findOne.mockResolvedValue({
        id: 'outreach-1',
        campaignId: mockCampaignId,
      });
      mockOutreachRepository.save.mockImplementation(async (r) => r);

      const followUpDate = new Date();
      followUpDate.setDate(followUpDate.getDate() + 30);

      const result = await service.scheduleFollowUp('outreach-1', followUpDate);

      expect(result.success).toBe(true);
    });
  });
});
