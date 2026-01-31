import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bull';
import { ClassificationProcessor, ClassificationJobData } from './classification.processor';
import { ClassifierService, ClassificationType } from '../ai/services/classifier.service';
import { ActionsService, ActionType } from '../campaigns/services/actions.service';
import { ContactsService } from '../hubspot/services/contacts.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OutreachRecord, OutreachStatus } from '../entities/outreach-record.entity';
import { Response, ResponseSentiment, ResponseIntent } from '../entities/response.entity';

describe('ClassificationProcessor', () => {
  let processor: ClassificationProcessor;
  let classifierService: jest.Mocked<ClassifierService>;
  let actionsService: jest.Mocked<ActionsService>;
  let contactsService: jest.Mocked<ContactsService>;
  let outreachRepository: jest.Mocked<Repository<OutreachRecord>>;
  let responseRepository: jest.Mocked<Repository<Response>>;

  const mockClassifierService = {
    classifyResponse: jest.fn(),
    shouldStopCampaign: jest.fn(),
    shouldPauseCampaign: jest.fn(),
    requiresFollowUp: jest.fn(),
  };

  const mockActionsService = {
    executeAction: jest.fn(),
    getActionsForClassification: jest.fn(),
    addToSuppressionList: jest.fn(),
    isInSuppressionList: jest.fn(),
  };

  const mockContactsService = {
    getContactById: jest.fn(),
    getEmailContent: jest.fn(),
  };

  const mockOutreachRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const mockResponseRepository = {
    create: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClassificationProcessor,
        { provide: ClassifierService, useValue: mockClassifierService },
        { provide: ActionsService, useValue: mockActionsService },
        { provide: ContactsService, useValue: mockContactsService },
        { provide: getRepositoryToken(OutreachRecord), useValue: mockOutreachRepository },
        { provide: getRepositoryToken(Response), useValue: mockResponseRepository },
      ],
    }).compile();

    processor = module.get<ClassificationProcessor>(ClassificationProcessor);
    classifierService = module.get(ClassifierService);
    actionsService = module.get(ActionsService);
    contactsService = module.get(ContactsService);
    outreachRepository = module.get(getRepositoryToken(OutreachRecord));
    responseRepository = module.get(getRepositoryToken(Response));

    jest.clearAllMocks();
  });

  describe('processClassification', () => {
    const mockJobData: ClassificationJobData = {
      outreachId: 'outreach-1',
      contactId: '1001',
      portalId: 12345,
      replyContent: 'Yes, I would like to learn more about your product!',
    };

    const mockOutreach = {
      id: 'outreach-1',
      hubspotContactId: 1001,
      accountId: 'account-1',
      status: OutreachStatus.REPLIED,
    };

    it('should classify an INTERESTED response', async () => {
      mockOutreachRepository.findOne.mockResolvedValue(mockOutreach as OutreachRecord);
      mockClassifierService.classifyResponse.mockResolvedValue({
        classification: ClassificationType.INTERESTED,
        confidence: 0.95,
        reason: 'Customer expressed interest in learning more',
      });
      mockActionsService.getActionsForClassification.mockReturnValue([
        ActionType.CREATE_TASK,
        ActionType.PAUSE_CAMPAIGN,
      ]);
      mockActionsService.executeAction.mockResolvedValue({
        success: true,
        actionsExecuted: [ActionType.CREATE_TASK, ActionType.PAUSE_CAMPAIGN],
        errors: [],
      });
      mockResponseRepository.create.mockReturnValue({ id: 'response-1' });
      mockResponseRepository.save.mockResolvedValue({ id: 'response-1' });

      const job = { data: mockJobData, id: '1' } as Job<ClassificationJobData>;

      const result = await processor.processClassification(job);

      expect(result.success).toBe(true);
      expect(result.classification).toBe(ClassificationType.INTERESTED);
      expect(mockActionsService.executeAction).toHaveBeenCalled();
    });

    it('should classify a NOT_NOW response', async () => {
      const jobData = {
        ...mockJobData,
        replyContent: 'Not right now, but reach out again in 3 months.',
      };

      mockOutreachRepository.findOne.mockResolvedValue(mockOutreach as OutreachRecord);
      mockClassifierService.classifyResponse.mockResolvedValue({
        classification: ClassificationType.NOT_NOW,
        confidence: 0.85,
        reason: 'Customer wants to be contacted later',
      });
      mockActionsService.getActionsForClassification.mockReturnValue([ActionType.SCHEDULE_FOLLOWUP]);
      mockActionsService.executeAction.mockResolvedValue({
        success: true,
        actionsExecuted: [ActionType.SCHEDULE_FOLLOWUP],
        errors: [],
      });
      mockResponseRepository.create.mockReturnValue({ id: 'response-1' });
      mockResponseRepository.save.mockResolvedValue({ id: 'response-1' });

      const job = { data: jobData, id: '2' } as Job<ClassificationJobData>;

      const result = await processor.processClassification(job);

      expect(result.success).toBe(true);
      expect(result.classification).toBe(ClassificationType.NOT_NOW);
    });

    it('should classify an UNSUBSCRIBE response', async () => {
      const jobData = {
        ...mockJobData,
        replyContent: 'Please remove me from your mailing list.',
      };

      mockOutreachRepository.findOne.mockResolvedValue(mockOutreach as OutreachRecord);
      mockClassifierService.classifyResponse.mockResolvedValue({
        classification: ClassificationType.UNSUBSCRIBE,
        confidence: 0.98,
        reason: 'Explicit unsubscribe request',
      });
      mockActionsService.getActionsForClassification.mockReturnValue([
        ActionType.REMOVE_FROM_ALL_CAMPAIGNS,
        ActionType.ADD_TO_SUPPRESSION,
      ]);
      mockActionsService.executeAction.mockResolvedValue({
        success: true,
        actionsExecuted: [ActionType.REMOVE_FROM_ALL_CAMPAIGNS, ActionType.ADD_TO_SUPPRESSION],
        errors: [],
      });
      mockResponseRepository.create.mockReturnValue({ id: 'response-1' });
      mockResponseRepository.save.mockResolvedValue({ id: 'response-1' });

      const job = { data: jobData, id: '3' } as Job<ClassificationJobData>;

      const result = await processor.processClassification(job);

      expect(result.success).toBe(true);
      expect(result.classification).toBe(ClassificationType.UNSUBSCRIBE);
    });

    it('should classify an OUT_OF_OFFICE response', async () => {
      const jobData = {
        ...mockJobData,
        replyContent: 'I am currently out of the office until January 15th.',
      };

      mockOutreachRepository.findOne.mockResolvedValue(mockOutreach as OutreachRecord);
      mockClassifierService.classifyResponse.mockResolvedValue({
        classification: ClassificationType.OUT_OF_OFFICE,
        confidence: 0.99,
        reason: 'Auto-reply detected',
        metadata: { returnDate: '2026-01-15' },
      });
      mockActionsService.getActionsForClassification.mockReturnValue([
        ActionType.RESCHEDULE,
        ActionType.PAUSE_CAMPAIGN,
      ]);
      mockActionsService.executeAction.mockResolvedValue({
        success: true,
        actionsExecuted: [ActionType.RESCHEDULE, ActionType.PAUSE_CAMPAIGN],
        errors: [],
      });
      mockResponseRepository.create.mockReturnValue({ id: 'response-1' });
      mockResponseRepository.save.mockResolvedValue({ id: 'response-1' });

      const job = { data: jobData, id: '4' } as Job<ClassificationJobData>;

      const result = await processor.processClassification(job);

      expect(result.success).toBe(true);
      expect(result.classification).toBe(ClassificationType.OUT_OF_OFFICE);
    });

    it('should store classification result in responses table', async () => {
      mockOutreachRepository.findOne.mockResolvedValue(mockOutreach as OutreachRecord);
      mockClassifierService.classifyResponse.mockResolvedValue({
        classification: ClassificationType.INTERESTED,
        confidence: 0.95,
        reason: 'Customer expressed interest',
      });
      mockActionsService.getActionsForClassification.mockReturnValue([ActionType.CREATE_TASK]);
      mockActionsService.executeAction.mockResolvedValue({
        success: true,
        actionsExecuted: [],
        errors: [],
      });
      mockResponseRepository.create.mockReturnValue({ id: 'response-1' });
      mockResponseRepository.save.mockResolvedValue({ id: 'response-1' });

      const job = { data: mockJobData, id: '1' } as Job<ClassificationJobData>;

      await processor.processClassification(job);

      expect(mockResponseRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          outreachId: 'outreach-1',
          sentiment: ResponseSentiment.POSITIVE,
          intent: ResponseIntent.INTERESTED,
          content: mockJobData.replyContent,
        }),
      );
      expect(mockResponseRepository.save).toHaveBeenCalled();
    });

    it('should handle missing outreach record', async () => {
      mockOutreachRepository.findOne.mockResolvedValue(null);

      const job = { data: mockJobData, id: '1' } as Job<ClassificationJobData>;

      const result = await processor.processClassification(job);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Outreach record not found');
      expect(mockClassifierService.classifyResponse).not.toHaveBeenCalled();
    });

    it('should handle classification errors gracefully', async () => {
      mockOutreachRepository.findOne.mockResolvedValue(mockOutreach as OutreachRecord);
      mockClassifierService.classifyResponse.mockRejectedValue(new Error('API error'));

      const job = { data: mockJobData, id: '1' } as Job<ClassificationJobData>;

      const result = await processor.processClassification(job);

      expect(result.success).toBe(false);
      expect(result.error).toContain('API error');
    });

    it('should handle action execution errors', async () => {
      mockOutreachRepository.findOne.mockResolvedValue(mockOutreach as OutreachRecord);
      mockClassifierService.classifyResponse.mockResolvedValue({
        classification: ClassificationType.INTERESTED,
        confidence: 0.95,
        reason: 'Customer expressed interest',
      });
      mockActionsService.getActionsForClassification.mockReturnValue([ActionType.CREATE_TASK]);
      mockActionsService.executeAction.mockResolvedValue({
        success: false,
        actionsExecuted: [ActionType.CREATE_TASK],
        errors: ['Failed to pause campaign'],
      });
      mockResponseRepository.create.mockReturnValue({ id: 'response-1' });
      mockResponseRepository.save.mockResolvedValue({ id: 'response-1' });

      const job = { data: mockJobData, id: '1' } as Job<ClassificationJobData>;

      const result = await processor.processClassification(job);

      // Should still succeed even if some actions fail
      expect(result.success).toBe(true);
      expect(result.actionErrors).toContain('Failed to pause campaign');
    });

    it('should fetch email content if not provided', async () => {
      const jobDataWithoutContent: ClassificationJobData = {
        outreachId: 'outreach-1',
        contactId: '1001',
        portalId: 12345,
        emailId: 'email-123',
        // No replyContent
      };

      mockOutreachRepository.findOne.mockResolvedValue(mockOutreach as OutreachRecord);
      mockContactsService.getEmailContent.mockResolvedValue({
        subject: 'Re: Hello',
        body: 'Yes, I am interested!',
      });
      mockClassifierService.classifyResponse.mockResolvedValue({
        classification: ClassificationType.INTERESTED,
        confidence: 0.95,
        reason: 'Customer expressed interest',
      });
      mockActionsService.getActionsForClassification.mockReturnValue([]);
      mockActionsService.executeAction.mockResolvedValue({
        success: true,
        actionsExecuted: [],
        errors: [],
      });
      mockResponseRepository.create.mockReturnValue({ id: 'response-1' });
      mockResponseRepository.save.mockResolvedValue({ id: 'response-1' });

      const job = { data: jobDataWithoutContent, id: '1' } as Job<ClassificationJobData>;

      await processor.processClassification(job);

      expect(mockContactsService.getEmailContent).toHaveBeenCalledWith(12345, 'email-123');
    });

    it('should handle missing reply content', async () => {
      const jobDataWithoutContent: ClassificationJobData = {
        outreachId: 'outreach-1',
        contactId: '1001',
        portalId: 12345,
        // No replyContent or emailId
      };

      mockOutreachRepository.findOne.mockResolvedValue(mockOutreach as OutreachRecord);

      const job = { data: jobDataWithoutContent, id: '1' } as Job<ClassificationJobData>;

      const result = await processor.processClassification(job);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No reply content available');
    });
  });
});
