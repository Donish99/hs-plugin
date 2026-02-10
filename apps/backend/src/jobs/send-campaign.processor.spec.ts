import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { Repository } from 'typeorm';
import { Job, Queue } from 'bull';
import { SendCampaignProcessor, ProcessCampaignJobData, SendMessageJobData, GenerateForReviewJobData } from './send-campaign.processor';
import { JobStatus } from './base.processor';
import { QUEUE_NAMES } from '../config/redis.config';
import { GeneratorService } from '../ai/services/generator.service';
import { VariantService } from '../ai/services/variant.service';
import { ReviewService } from '../ai/services/review.service';
import { EmailService } from '../outreach/services/email.service';
import { SmsService } from '../outreach/services/sms.service';
import { HubspotLoggerService } from '../outreach/services/hubspot-logger.service';
import { EventsService } from '../events/events.service';
import { OutreachRecord, OutreachStatus, OutreachChannel } from '../entities/outreach-record.entity';
import { Campaign, CampaignStatus } from '../entities/campaign.entity';

describe('SendCampaignProcessor', () => {
  let processor: SendCampaignProcessor;
  let sendCampaignQueue: jest.Mocked<Queue>;
  let outreachRepository: jest.Mocked<Repository<OutreachRecord>>;
  let campaignRepository: jest.Mocked<Repository<Campaign>>;
  let generatorService: jest.Mocked<GeneratorService>;
  let variantService: jest.Mocked<VariantService>;
  let reviewService: jest.Mocked<ReviewService>;
  let emailService: jest.Mocked<EmailService>;
  let smsService: jest.Mocked<SmsService>;
  let hubspotLogger: jest.Mocked<HubspotLoggerService>;
  let eventsService: jest.Mocked<EventsService>;

  // Factory functions to create fresh mock data for each test
  const createMockCampaign = (overrides?: Partial<Campaign>): Partial<Campaign> => ({
    id: 'campaign-123',
    accountId: 'account-456',
    status: CampaignStatus.RUNNING,
    emailsSent: 0,
    totalContacts: 2,
    requiresReview: false,
    ...overrides,
  });

  const createMockOutreachRecord = (): Partial<OutreachRecord> => ({
    id: 'outreach-789',
    campaignId: 'campaign-123',
    accountId: 'account-456',
    hubspotContactId: 12345,
    contactEmail: 'test@example.com',
    contactName: 'Test User',
    channel: OutreachChannel.EMAIL,
    status: OutreachStatus.PENDING,
  });

  beforeEach(async () => {
    // Create fresh mocks for each test to ensure isolation
    const mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-123' }),
    };

    const mockOutreachRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn(),
      save: jest.fn().mockImplementation((record: any) => Promise.resolve(record)),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    const mockCampaignRepo = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((campaign: any) => Promise.resolve(campaign)),
      increment: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    const mockGeneratorService = {
      generateMessage: jest.fn(),
    };

    const mockVariantService = {
      storeVariants: jest.fn().mockResolvedValue({
        variantGroupId: 'group-123',
        variants: [{ id: 'variant-123' }],
      }),
      markVariantAsSent: jest.fn().mockResolvedValue({}),
    };

    const mockReviewService = {
      queueForReview: jest.fn().mockResolvedValue({ id: 'review-123' }),
    };

    const mockEmailService = {
      sendEmailWithRetry: jest.fn(),
    };

    const mockSmsService = {
      sendSmsWithRetry: jest.fn(),
    };

    const mockHubspotLogger = {
      logEmailSent: jest.fn().mockResolvedValue({ success: true }),
      logSmsSent: jest.fn().mockResolvedValue({ success: true }),
    };

    const mockEventsService = {
      emitMessageGenerating: jest.fn(),
      emitMessageGenerated: jest.fn(),
      emitMessageSent: jest.fn(),
      emitMessageFailed: jest.fn(),
      emitCampaignCompleted: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SendCampaignProcessor,
        {
          provide: getQueueToken(QUEUE_NAMES.SEND_CAMPAIGN),
          useValue: mockQueue,
        },
        {
          provide: getRepositoryToken(OutreachRecord),
          useValue: mockOutreachRepo,
        },
        {
          provide: getRepositoryToken(Campaign),
          useValue: mockCampaignRepo,
        },
        {
          provide: GeneratorService,
          useValue: mockGeneratorService,
        },
        {
          provide: VariantService,
          useValue: mockVariantService,
        },
        {
          provide: ReviewService,
          useValue: mockReviewService,
        },
        {
          provide: EmailService,
          useValue: mockEmailService,
        },
        {
          provide: SmsService,
          useValue: mockSmsService,
        },
        {
          provide: HubspotLoggerService,
          useValue: mockHubspotLogger,
        },
        {
          provide: EventsService,
          useValue: mockEventsService,
        },
      ],
    }).compile();

    processor = module.get<SendCampaignProcessor>(SendCampaignProcessor);
    sendCampaignQueue = module.get(getQueueToken(QUEUE_NAMES.SEND_CAMPAIGN));
    outreachRepository = module.get(getRepositoryToken(OutreachRecord));
    campaignRepository = module.get(getRepositoryToken(Campaign));
    generatorService = module.get(GeneratorService);
    variantService = module.get(VariantService);
    reviewService = module.get(ReviewService);
    emailService = module.get(EmailService);
    smsService = module.get(SmsService);
    hubspotLogger = module.get(HubspotLoggerService);
    eventsService = module.get(EventsService);
  });

  describe('processCampaign', () => {
    const createMockJob = (data: ProcessCampaignJobData): Partial<Job<ProcessCampaignJobData>> => ({
      id: 'job-1',
      data,
      progress: jest.fn().mockResolvedValue(undefined),
      attemptsMade: 0,
    });

    it('should queue send-message jobs for all pending outreach records', async () => {
      campaignRepository.findOne.mockResolvedValue(createMockCampaign() as Campaign);
      outreachRepository.find.mockResolvedValue([
        { ...createMockOutreachRecord(), id: 'outreach-1' },
        { ...createMockOutreachRecord(), id: 'outreach-2' },
      ] as OutreachRecord[]);

      const job = createMockJob({
        type: 'process-campaign',
        campaignId: 'campaign-123',
        accountId: 'account-456',
        portalId: 12345,
      });

      const result = await processor.processCampaign(job as Job<ProcessCampaignJobData>);

      expect(result.status).toBe(JobStatus.COMPLETED);
      expect(result.data?.queuedCount).toBe(2);
      expect(sendCampaignQueue.add).toHaveBeenCalledTimes(2);
    });

    it('should return failed status if campaign not found', async () => {
      campaignRepository.findOne.mockResolvedValue(null);

      const job = createMockJob({
        type: 'process-campaign',
        campaignId: 'nonexistent',
        accountId: 'account-456',
        portalId: 12345,
      });

      const result = await processor.processCampaign(job as Job<ProcessCampaignJobData>);

      expect(result.status).toBe(JobStatus.FAILED);
      expect(result.error).toContain('not found');
    });

    it('should skip if campaign is not running', async () => {
      campaignRepository.findOne.mockResolvedValue({
        ...createMockCampaign(),
        status: CampaignStatus.PAUSED,
      } as Campaign);

      const job = createMockJob({
        type: 'process-campaign',
        campaignId: 'campaign-123',
        accountId: 'account-456',
        portalId: 12345,
      });

      const result = await processor.processCampaign(job as Job<ProcessCampaignJobData>);

      expect(result.status).toBe(JobStatus.COMPLETED);
      expect(result.message).toContain('not running');
      expect(sendCampaignQueue.add).not.toHaveBeenCalled();
    });

    it('should mark campaign as completed when no pending records', async () => {
      campaignRepository.findOne.mockResolvedValue(createMockCampaign({ requiresReview: false }) as Campaign);
      outreachRepository.find.mockResolvedValue([]);
      // First count call checks remaining pending/pending_review, second checks total records
      outreachRepository.count
        .mockResolvedValueOnce(0) // No remaining pending records
        .mockResolvedValueOnce(5); // Has processed records

      const job = createMockJob({
        type: 'process-campaign',
        campaignId: 'campaign-123',
        accountId: 'account-456',
        portalId: 12345,
      });

      const result = await processor.processCampaign(job as Job<ProcessCampaignJobData>);

      expect(result.status).toBe(JobStatus.COMPLETED);
      expect(campaignRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: CampaignStatus.COMPLETED,
        }),
      );
    });
  });

  describe('sendMessage', () => {
    const createMockJob = (data: SendMessageJobData): Partial<Job<SendMessageJobData>> => ({
      id: 'job-1',
      data,
      progress: jest.fn().mockResolvedValue(undefined),
      attemptsMade: 0,
    });

    it('should generate message and send email successfully', async () => {
      const pendingRecord = { ...createMockOutreachRecord() } as OutreachRecord;
      outreachRepository.findOne.mockResolvedValue(pendingRecord);
      campaignRepository.findOne.mockResolvedValue(createMockCampaign() as Campaign);

      generatorService.generateMessage.mockResolvedValue({
        message: { subject: 'Test Subject', body: 'Test Body' },
        tone: 'professional',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        context: {} as any,
      });

      emailService.sendEmailWithRetry.mockResolvedValue({
        success: true,
        messageId: 'sendgrid-msg-123',
      });

      hubspotLogger.logEmailSent.mockResolvedValue({ success: true });
      outreachRepository.count.mockResolvedValue(0); // No more pending

      const job = createMockJob({
        type: 'send-message',
        outreachRecordId: 'outreach-789',
        campaignId: 'campaign-123',
        accountId: 'account-456',
        portalId: 12345,
      });

      const result = await processor.sendMessage(job as Job<SendMessageJobData>);

      expect(result.status).toBe(JobStatus.COMPLETED);
      expect(generatorService.generateMessage).toHaveBeenCalledWith(
        'account-456',
        12345,
        '12345', // hubspotContactId as string
      );
      expect(emailService.sendEmailWithRetry).toHaveBeenCalledWith({
        to: 'test@example.com',
        subject: 'Test Subject',
        body: expect.stringContaining('Test Body'),
        textBody: 'Test Body',
      });
      expect(outreachRepository.save).toHaveBeenCalled();
      expect(hubspotLogger.logEmailSent).toHaveBeenCalled();
    });

    it('should use existing message content if already generated', async () => {
      const recordWithContent = {
        ...createMockOutreachRecord(),
        subject: 'Existing Subject',
        bodyText: 'Existing Body',
        bodyHtml: '<p>Existing Body</p>',
      } as OutreachRecord;

      outreachRepository.findOne.mockResolvedValue(recordWithContent);
      campaignRepository.findOne.mockResolvedValue(createMockCampaign() as Campaign);

      emailService.sendEmailWithRetry.mockResolvedValue({
        success: true,
        messageId: 'sendgrid-msg-123',
      });

      hubspotLogger.logEmailSent.mockResolvedValue({ success: true });
      outreachRepository.count.mockResolvedValue(0);

      const job = createMockJob({
        type: 'send-message',
        outreachRecordId: 'outreach-789',
        campaignId: 'campaign-123',
        accountId: 'account-456',
        portalId: 12345,
      });

      await processor.sendMessage(job as Job<SendMessageJobData>);

      expect(generatorService.generateMessage).not.toHaveBeenCalled();
      expect(emailService.sendEmailWithRetry).toHaveBeenCalledWith({
        to: 'test@example.com',
        subject: 'Existing Subject',
        body: '<p>Existing Body</p>',
        textBody: 'Existing Body',
      });
    });

    it('should return failed status if outreach record not found', async () => {
      outreachRepository.findOne.mockResolvedValue(null);

      const job = createMockJob({
        type: 'send-message',
        outreachRecordId: 'nonexistent',
        campaignId: 'campaign-123',
        accountId: 'account-456',
        portalId: 12345,
      });

      const result = await processor.sendMessage(job as Job<SendMessageJobData>);

      expect(result.status).toBe(JobStatus.FAILED);
      expect(result.error).toContain('not found');
    });

    it('should skip if outreach record is not pending', async () => {
      outreachRepository.findOne.mockResolvedValue({
        ...createMockOutreachRecord(),
        status: OutreachStatus.SENT,
      } as OutreachRecord);

      const job = createMockJob({
        type: 'send-message',
        outreachRecordId: 'outreach-789',
        campaignId: 'campaign-123',
        accountId: 'account-456',
        portalId: 12345,
      });

      const result = await processor.sendMessage(job as Job<SendMessageJobData>);

      expect(result.status).toBe(JobStatus.COMPLETED);
      expect(result.message).toContain('already processed');
    });

    it('should skip if campaign is not running', async () => {
      outreachRepository.findOne.mockResolvedValue(createMockOutreachRecord() as OutreachRecord);
      campaignRepository.findOne.mockResolvedValue({
        ...createMockCampaign(),
        status: CampaignStatus.PAUSED,
      } as Campaign);

      const job = createMockJob({
        type: 'send-message',
        outreachRecordId: 'outreach-789',
        campaignId: 'campaign-123',
        accountId: 'account-456',
        portalId: 12345,
      });

      const result = await processor.sendMessage(job as Job<SendMessageJobData>);

      expect(result.status).toBe(JobStatus.COMPLETED);
      expect(result.message).toContain('not running');
    });

    it('should mark record as failed if AI generation fails', async () => {
      outreachRepository.findOne.mockResolvedValue(createMockOutreachRecord() as OutreachRecord);
      campaignRepository.findOne.mockResolvedValue(createMockCampaign() as Campaign);
      generatorService.generateMessage.mockRejectedValue(new Error('OpenAI API error'));

      const job = createMockJob({
        type: 'send-message',
        outreachRecordId: 'outreach-789',
        campaignId: 'campaign-123',
        accountId: 'account-456',
        portalId: 12345,
      });

      const result = await processor.sendMessage(job as Job<SendMessageJobData>);

      expect(result.status).toBe(JobStatus.FAILED);
      expect(result.error).toContain('OpenAI API error');
      expect(outreachRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: OutreachStatus.FAILED,
        }),
      );
    });

    it('should mark record as failed if email sending fails', async () => {
      const pendingRecord = {
        ...createMockOutreachRecord(),
        subject: 'Test Subject',
        bodyText: 'Test Body',
      } as OutreachRecord;

      outreachRepository.findOne.mockResolvedValue(pendingRecord);
      campaignRepository.findOne.mockResolvedValue(createMockCampaign() as Campaign);

      emailService.sendEmailWithRetry.mockResolvedValue({
        success: false,
        error: 'SendGrid API error',
      });

      const job = createMockJob({
        type: 'send-message',
        outreachRecordId: 'outreach-789',
        campaignId: 'campaign-123',
        accountId: 'account-456',
        portalId: 12345,
      });

      const result = await processor.sendMessage(job as Job<SendMessageJobData>);

      expect(result.status).toBe(JobStatus.FAILED);
      expect(outreachRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: OutreachStatus.FAILED,
        }),
      );
    });

    it('should fail if contact has no email address', async () => {
      const recordWithoutEmail = {
        ...createMockOutreachRecord(),
        contactEmail: undefined,
        subject: 'Test Subject',
        bodyText: 'Test Body',
        bodyHtml: '<p>Test Body</p>',
      } as OutreachRecord;
      outreachRepository.findOne.mockResolvedValue(recordWithoutEmail);
      campaignRepository.findOne.mockResolvedValue(createMockCampaign() as Campaign);
      outreachRepository.save.mockResolvedValue(recordWithoutEmail);

      const job = createMockJob({
        type: 'send-message',
        outreachRecordId: 'outreach-789',
        campaignId: 'campaign-123',
        accountId: 'account-456',
        portalId: 12345,
      });

      const result = await processor.sendMessage(job as Job<SendMessageJobData>);

      expect(result.status).toBe(JobStatus.FAILED);
      expect(result.error).toContain('Missing contact email');
      expect(outreachRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: OutreachStatus.FAILED,
        }),
      );
    });

    it('should mark campaign as completed when last record is sent', async () => {
      const pendingRecord = {
        ...createMockOutreachRecord(),
        subject: 'Test Subject',
        bodyText: 'Test Body',
      } as OutreachRecord;

      outreachRepository.findOne.mockResolvedValue(pendingRecord);
      campaignRepository.findOne
        .mockResolvedValueOnce(createMockCampaign() as Campaign) // First call for validation
        .mockResolvedValueOnce(createMockCampaign() as Campaign); // Second call for completion check

      emailService.sendEmailWithRetry.mockResolvedValue({
        success: true,
        messageId: 'sendgrid-msg-123',
      });

      hubspotLogger.logEmailSent.mockResolvedValue({ success: true });
      outreachRepository.count.mockResolvedValue(0); // No more pending records

      const job = createMockJob({
        type: 'send-message',
        outreachRecordId: 'outreach-789',
        campaignId: 'campaign-123',
        accountId: 'account-456',
        portalId: 12345,
      });

      await processor.sendMessage(job as Job<SendMessageJobData>);

      expect(campaignRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: CampaignStatus.COMPLETED,
        }),
      );
    });

    it('should update campaign emailsSent counter on success', async () => {
      const pendingRecord = {
        ...createMockOutreachRecord(),
        subject: 'Test Subject',
        bodyText: 'Test Body',
      } as OutreachRecord;

      outreachRepository.findOne.mockResolvedValue(pendingRecord);
      campaignRepository.findOne.mockResolvedValue(createMockCampaign() as Campaign);

      emailService.sendEmailWithRetry.mockResolvedValue({
        success: true,
        messageId: 'sendgrid-msg-123',
      });

      hubspotLogger.logEmailSent.mockResolvedValue({ success: true });
      outreachRepository.count.mockResolvedValue(1); // Still has pending

      const job = createMockJob({
        type: 'send-message',
        outreachRecordId: 'outreach-789',
        campaignId: 'campaign-123',
        accountId: 'account-456',
        portalId: 12345,
      });

      await processor.sendMessage(job as Job<SendMessageJobData>);

      expect(campaignRepository.increment).toHaveBeenCalledWith(
        { id: 'campaign-123' },
        'emailsSent',
        1,
      );
    });
  });

  describe('processJob', () => {
    it('should route process-campaign jobs correctly', async () => {
      campaignRepository.findOne.mockResolvedValue(createMockCampaign() as Campaign);
      outreachRepository.find.mockResolvedValue([]);
      outreachRepository.count.mockResolvedValue(1);

      const job = {
        id: 'job-1',
        name: 'process-campaign',
        data: {
          type: 'process-campaign' as const,
          campaignId: 'campaign-123',
          accountId: 'account-456',
          portalId: 12345,
        },
        progress: jest.fn().mockResolvedValue(undefined),
        attemptsMade: 0,
      };

      const result = await processor.processJob(job as any);

      expect(result.status).toBe(JobStatus.COMPLETED);
    });

    it('should route send-message jobs correctly', async () => {
      outreachRepository.findOne.mockResolvedValue(null);

      const job = {
        id: 'job-1',
        name: 'send-message',
        data: {
          type: 'send-message' as const,
          outreachRecordId: 'outreach-789',
          campaignId: 'campaign-123',
          accountId: 'account-456',
          portalId: 12345,
        },
        progress: jest.fn().mockResolvedValue(undefined),
        attemptsMade: 0,
      };

      const result = await processor.processJob(job as any);

      expect(result.status).toBe(JobStatus.FAILED);
      expect(result.error).toContain('not found');
    });

    it('should return failed for unknown job types', async () => {
      const job = {
        id: 'job-1',
        name: 'unknown',
        data: {
          type: 'unknown' as any,
        },
        progress: jest.fn().mockResolvedValue(undefined),
        attemptsMade: 0,
      };

      const result = await processor.processJob(job as any);

      expect(result.status).toBe(JobStatus.FAILED);
      expect(result.error).toContain('Unknown job type');
    });
  });

  describe('processCampaign with requiresReview', () => {
    const createMockJob = (data: ProcessCampaignJobData): Partial<Job<ProcessCampaignJobData>> => ({
      id: 'job-1',
      data,
      progress: jest.fn().mockResolvedValue(undefined),
      attemptsMade: 0,
    });

    it('should queue generate-for-review jobs when campaign requires review', async () => {
      campaignRepository.findOne.mockResolvedValue(createMockCampaign({ requiresReview: true }) as Campaign);
      outreachRepository.find.mockResolvedValue([
        { ...createMockOutreachRecord(), id: 'outreach-1' },
        { ...createMockOutreachRecord(), id: 'outreach-2' },
      ] as OutreachRecord[]);

      const job = createMockJob({
        type: 'process-campaign',
        campaignId: 'campaign-123',
        accountId: 'account-456',
        portalId: 12345,
      });

      const result = await processor.processCampaign(job as Job<ProcessCampaignJobData>);

      expect(result.status).toBe(JobStatus.COMPLETED);
      expect(result.data?.queuedCount).toBe(2);
      expect(result.data?.requiresReview).toBe(true);
      expect(sendCampaignQueue.add).toHaveBeenCalledTimes(2);
      expect(sendCampaignQueue.add).toHaveBeenCalledWith(
        'generate-for-review',
        expect.objectContaining({ type: 'generate-for-review' }),
        expect.any(Object),
      );
    });

    it('should queue send-message jobs when campaign does not require review', async () => {
      campaignRepository.findOne.mockResolvedValue(createMockCampaign({ requiresReview: false }) as Campaign);
      outreachRepository.find.mockResolvedValue([
        { ...createMockOutreachRecord(), id: 'outreach-1' },
      ] as OutreachRecord[]);

      const job = createMockJob({
        type: 'process-campaign',
        campaignId: 'campaign-123',
        accountId: 'account-456',
        portalId: 12345,
      });

      const result = await processor.processCampaign(job as Job<ProcessCampaignJobData>);

      expect(result.status).toBe(JobStatus.COMPLETED);
      expect(sendCampaignQueue.add).toHaveBeenCalledWith(
        'send-message',
        expect.objectContaining({ type: 'send-message' }),
        expect.any(Object),
      );
    });
  });

  describe('generateForReview', () => {
    const createMockJob = (data: GenerateForReviewJobData): Partial<Job<GenerateForReviewJobData>> => ({
      id: 'job-1',
      data,
      progress: jest.fn().mockResolvedValue(undefined),
      attemptsMade: 0,
    });

    it('should generate message, store variant, and queue for review', async () => {
      outreachRepository.findOne.mockResolvedValue(createMockOutreachRecord() as OutreachRecord);
      campaignRepository.findOne.mockResolvedValue(createMockCampaign({ requiresReview: true }) as Campaign);

      generatorService.generateMessage.mockResolvedValue({
        message: { subject: 'Test Subject', body: 'Test Body' },
        tone: 'professional',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        context: {} as any,
      });

      const job = createMockJob({
        type: 'generate-for-review',
        outreachRecordId: 'outreach-789',
        campaignId: 'campaign-123',
        accountId: 'account-456',
        portalId: 12345,
      });

      const result = await processor.generateForReview(job as Job<GenerateForReviewJobData>);

      expect(result.status).toBe(JobStatus.COMPLETED);
      expect(result.message).toContain('queued for review');
      expect(generatorService.generateMessage).toHaveBeenCalled();
      expect(variantService.storeVariants).toHaveBeenCalledWith(
        'account-456',
        12345,
        expect.arrayContaining([
          expect.objectContaining({ subject: 'Test Subject', body: 'Test Body' }),
        ]),
        expect.any(Object),
      );
      expect(reviewService.queueForReview).toHaveBeenCalledWith(
        'account-456',
        expect.objectContaining({
          variantId: 'variant-123',
          campaignId: 'campaign-123',
        }),
      );
      expect(outreachRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: OutreachStatus.PENDING_REVIEW,
        }),
      );
    });

    it('should skip if outreach record already processed', async () => {
      outreachRepository.findOne.mockResolvedValue({
        ...createMockOutreachRecord(),
        status: OutreachStatus.SENT,
      } as OutreachRecord);

      const job = createMockJob({
        type: 'generate-for-review',
        outreachRecordId: 'outreach-789',
        campaignId: 'campaign-123',
        accountId: 'account-456',
        portalId: 12345,
      });

      const result = await processor.generateForReview(job as Job<GenerateForReviewJobData>);

      expect(result.status).toBe(JobStatus.COMPLETED);
      expect(result.message).toContain('already processed');
      expect(generatorService.generateMessage).not.toHaveBeenCalled();
    });

    it('should fail if AI generation fails', async () => {
      outreachRepository.findOne.mockResolvedValue(createMockOutreachRecord() as OutreachRecord);
      campaignRepository.findOne.mockResolvedValue(createMockCampaign({ requiresReview: true }) as Campaign);
      generatorService.generateMessage.mockRejectedValue(new Error('OpenAI API error'));

      const job = createMockJob({
        type: 'generate-for-review',
        outreachRecordId: 'outreach-789',
        campaignId: 'campaign-123',
        accountId: 'account-456',
        portalId: 12345,
      });

      const result = await processor.generateForReview(job as Job<GenerateForReviewJobData>);

      expect(result.status).toBe(JobStatus.FAILED);
      expect(result.error).toContain('OpenAI API error');
      expect(outreachRepository.update).toHaveBeenCalledWith(
        { id: 'outreach-789' },
        { status: OutreachStatus.FAILED },
      );
    });
  });
});
