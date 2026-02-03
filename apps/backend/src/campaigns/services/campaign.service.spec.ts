import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { Repository } from 'typeorm';
import { CampaignService, CreateCampaignFromScanDto } from './campaign.service';
import { Campaign, CampaignStatus } from '../../entities/campaign.entity';
import { OutreachRecord, OutreachChannel, OutreachStatus } from '../../entities/outreach-record.entity';
import { DormancyDetectionService } from './dormancy-detection.service';
import { HubSpotContact, ScanResult } from './scanner.service';
import { QUEUE_NAMES } from '../../config/redis.config';

describe('CampaignService', () => {
  let service: CampaignService;
  let campaignRepository: jest.Mocked<Repository<Campaign>>;
  let outreachRepository: jest.Mocked<Repository<OutreachRecord>>;
  let dormancyDetectionService: jest.Mocked<DormancyDetectionService>;

  const mockCampaignRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockOutreachRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockDormancyDetectionService = {
    calculateDormancyScore: jest.fn(),
    prioritizeContacts: jest.fn(),
    generateDormancyReport: jest.fn(),
    getContactEngagementData: jest.fn(),
  };

  const mockSendCampaignQueue = {
    add: jest.fn().mockResolvedValue({ id: 'job-123' }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignService,
        {
          provide: getRepositoryToken(Campaign),
          useValue: mockCampaignRepository,
        },
        {
          provide: getRepositoryToken(OutreachRecord),
          useValue: mockOutreachRepository,
        },
        {
          provide: DormancyDetectionService,
          useValue: mockDormancyDetectionService,
        },
        {
          provide: getQueueToken(QUEUE_NAMES.SEND_CAMPAIGN),
          useValue: mockSendCampaignQueue,
        },
      ],
    }).compile();

    service = module.get<CampaignService>(CampaignService);
    campaignRepository = module.get(getRepositoryToken(Campaign));
    outreachRepository = module.get(getRepositoryToken(OutreachRecord));
    dormancyDetectionService = module.get(DormancyDetectionService);

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('createCampaignFromScan', () => {
    const accountId = 'account-123';
    const ruleId = 'rule-456';

    const mockContacts: HubSpotContact[] = [
      {
        id: '1001',
        properties: {
          email: 'john@example.com',
          firstname: 'John',
          lastname: 'Doe',
          company: 'Acme Corp',
        },
        createdAt: '2024-01-01',
        updatedAt: '2024-03-01',
      },
      {
        id: '1002',
        properties: {
          email: 'jane@example.com',
          firstname: 'Jane',
          lastname: 'Smith',
          company: 'Tech Inc',
        },
        createdAt: '2024-01-01',
        updatedAt: '2024-02-01',
      },
    ];

    const mockScanResult: ScanResult = {
      ruleId,
      contacts: mockContacts,
      totalFound: 2,
      scannedAt: new Date('2024-06-01'),
    };

    it('should create a campaign from scan results', async () => {
      const mockCampaign = {
        id: 'campaign-789',
        accountId,
        ruleId,
        name: 'Test Campaign',
        status: CampaignStatus.DRAFT,
        totalContacts: 2,
        createdAt: new Date(),
      };

      mockCampaignRepository.create.mockReturnValue(mockCampaign);
      mockCampaignRepository.save.mockResolvedValue(mockCampaign);
      mockOutreachRepository.create.mockImplementation((data) => data);
      mockOutreachRepository.save.mockResolvedValue([]);

      const dto: CreateCampaignFromScanDto = {
        accountId,
        scanResult: mockScanResult,
        name: 'Test Campaign',
      };

      const result = await service.createCampaignFromScan(dto);

      expect(result).toBeDefined();
      expect(result.campaign).not.toBeNull();
      expect(result.campaign!.accountId).toBe(accountId);
      expect(result.campaign!.ruleId).toBe(ruleId);
      expect(mockCampaignRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId,
          ruleId,
          name: 'Test Campaign',
          totalContacts: 2,
          status: CampaignStatus.DRAFT,
        }),
      );
    });

    it('should create outreach records for each contact', async () => {
      const mockCampaign = {
        id: 'campaign-789',
        accountId,
        ruleId,
        totalContacts: 2,
      };

      mockCampaignRepository.create.mockReturnValue(mockCampaign);
      mockCampaignRepository.save.mockResolvedValue(mockCampaign);
      mockOutreachRepository.create.mockImplementation((data) => data);
      mockOutreachRepository.save.mockResolvedValue([]);

      const dto: CreateCampaignFromScanDto = {
        accountId,
        scanResult: mockScanResult,
        channel: OutreachChannel.EMAIL,
      };

      await service.createCampaignFromScan(dto);

      expect(mockOutreachRepository.create).toHaveBeenCalledTimes(2);
      expect(mockOutreachRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          campaignId: 'campaign-789',
          accountId,
          hubspotContactId: 1001,
          contactEmail: 'john@example.com',
          contactName: 'John Doe',
          companyName: 'Acme Corp',
          channel: OutreachChannel.EMAIL,
          status: OutreachStatus.PENDING,
        }),
      );
    });

    it('should handle contacts without email addresses gracefully', async () => {
      const contactsWithMissingEmail: HubSpotContact[] = [
        {
          id: '1001',
          properties: {
            firstname: 'John',
            lastname: 'Doe',
            // No email
          },
          createdAt: '2024-01-01',
          updatedAt: '2024-03-01',
        },
        {
          id: '1002',
          properties: {
            email: 'jane@example.com',
            firstname: 'Jane',
          },
          createdAt: '2024-01-01',
          updatedAt: '2024-02-01',
        },
      ];

      const scanResult: ScanResult = {
        ruleId,
        contacts: contactsWithMissingEmail,
        totalFound: 2,
        scannedAt: new Date(),
      };

      const mockCampaign = {
        id: 'campaign-789',
        accountId,
        totalContacts: 1, // Only one valid contact
      };

      mockCampaignRepository.create.mockReturnValue(mockCampaign);
      mockCampaignRepository.save.mockResolvedValue(mockCampaign);
      mockOutreachRepository.create.mockImplementation((data) => data);
      mockOutreachRepository.save.mockResolvedValue([]);

      const dto: CreateCampaignFromScanDto = {
        accountId,
        scanResult,
        channel: OutreachChannel.EMAIL,
      };

      const result = await service.createCampaignFromScan(dto);

      // Should only create outreach for contact with email
      expect(result.outreachRecordsCreated).toBe(1);
      expect(result.contactsSkipped).toBe(1);
    });

    it('should generate campaign name if not provided', async () => {
      const mockCampaign = {
        id: 'campaign-789',
        accountId,
        ruleId,
        totalContacts: 2,
      };

      mockCampaignRepository.create.mockReturnValue(mockCampaign);
      mockCampaignRepository.save.mockResolvedValue(mockCampaign);
      mockOutreachRepository.create.mockImplementation((data) => data);
      mockOutreachRepository.save.mockResolvedValue([]);

      const dto: CreateCampaignFromScanDto = {
        accountId,
        scanResult: mockScanResult,
        // No name provided
      };

      await service.createCampaignFromScan(dto);

      expect(mockCampaignRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: expect.stringContaining('Dormancy Campaign'),
        }),
      );
    });

    it('should return campaign creation summary', async () => {
      const mockCampaign = {
        id: 'campaign-789',
        accountId,
        ruleId,
        totalContacts: 2,
      };

      mockCampaignRepository.create.mockReturnValue(mockCampaign);
      mockCampaignRepository.save.mockResolvedValue(mockCampaign);
      mockOutreachRepository.create.mockImplementation((data) => data);
      mockOutreachRepository.save.mockResolvedValue([]);

      const dto: CreateCampaignFromScanDto = {
        accountId,
        scanResult: mockScanResult,
      };

      const result = await service.createCampaignFromScan(dto);

      expect(result.campaign).toBeDefined();
      expect(result.outreachRecordsCreated).toBe(2);
      expect(result.contactsSkipped).toBe(0);
    });

    it('should handle empty scan results', async () => {
      const emptyScanResult: ScanResult = {
        ruleId,
        contacts: [],
        totalFound: 0,
        scannedAt: new Date(),
      };

      const dto: CreateCampaignFromScanDto = {
        accountId,
        scanResult: emptyScanResult,
      };

      const result = await service.createCampaignFromScan(dto);

      expect(result.campaign).toBeNull();
      expect(result.outreachRecordsCreated).toBe(0);
      expect(mockCampaignRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('createCampaignsFromMultipleScans', () => {
    const accountId = 'account-123';

    it('should create multiple campaigns from multiple scan results', async () => {
      const scanResults: ScanResult[] = [
        {
          ruleId: 'rule-1',
          contacts: [
            { id: '1', properties: { email: 'a@test.com' }, createdAt: '', updatedAt: '' },
          ],
          totalFound: 1,
          scannedAt: new Date(),
        },
        {
          ruleId: 'rule-2',
          contacts: [
            { id: '2', properties: { email: 'b@test.com' }, createdAt: '', updatedAt: '' },
          ],
          totalFound: 1,
          scannedAt: new Date(),
        },
      ];

      mockCampaignRepository.create.mockImplementation((data) => ({
        id: `campaign-${data.ruleId}`,
        ...data,
      }));
      mockCampaignRepository.save.mockImplementation((campaign) =>
        Promise.resolve(campaign),
      );
      mockOutreachRepository.create.mockImplementation((data) => data);
      mockOutreachRepository.save.mockResolvedValue([]);

      const results = await service.createCampaignsFromMultipleScans(
        accountId,
        scanResults,
      );

      expect(results).toHaveLength(2);
      expect(results[0].campaign?.ruleId).toBe('rule-1');
      expect(results[1].campaign?.ruleId).toBe('rule-2');
    });

    it('should skip scan results with no contacts', async () => {
      const scanResults: ScanResult[] = [
        {
          ruleId: 'rule-1',
          contacts: [],
          totalFound: 0,
          scannedAt: new Date(),
        },
        {
          ruleId: 'rule-2',
          contacts: [
            { id: '2', properties: { email: 'b@test.com' }, createdAt: '', updatedAt: '' },
          ],
          totalFound: 1,
          scannedAt: new Date(),
        },
      ];

      mockCampaignRepository.create.mockImplementation((data) => ({
        id: 'campaign-123',
        ...data,
      }));
      mockCampaignRepository.save.mockImplementation((campaign) =>
        Promise.resolve(campaign),
      );
      mockOutreachRepository.create.mockImplementation((data) => data);
      mockOutreachRepository.save.mockResolvedValue([]);

      const results = await service.createCampaignsFromMultipleScans(
        accountId,
        scanResults,
      );

      // First result should have null campaign (empty), second should have campaign
      expect(results[0].campaign).toBeNull();
      expect(results[1].campaign).toBeDefined();
    });
  });

  describe('findCampaignsByAccount', () => {
    it('should return campaigns for an account', async () => {
      const mockCampaigns = [
        { id: 'c1', accountId: 'acc-1', status: CampaignStatus.DRAFT },
        { id: 'c2', accountId: 'acc-1', status: CampaignStatus.RUNNING },
      ];

      mockCampaignRepository.find.mockResolvedValue(mockCampaigns as Campaign[]);

      const result = await service.findCampaignsByAccount('acc-1');

      expect(result).toHaveLength(2);
      expect(mockCampaignRepository.find).toHaveBeenCalledWith({
        where: { accountId: 'acc-1' },
        order: { createdAt: 'DESC' },
      });
    });

    it('should filter by status when provided', async () => {
      mockCampaignRepository.find.mockResolvedValue([]);

      await service.findCampaignsByAccount('acc-1', {
        status: CampaignStatus.RUNNING,
      });

      expect(mockCampaignRepository.find).toHaveBeenCalledWith({
        where: { accountId: 'acc-1', status: CampaignStatus.RUNNING },
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('getCampaignWithOutreachRecords', () => {
    it('should return campaign with its outreach records', async () => {
      const mockCampaign = {
        id: 'campaign-1',
        accountId: 'acc-1',
        totalContacts: 2,
      };

      const mockOutreachRecords = [
        { id: 'or-1', campaignId: 'campaign-1', contactEmail: 'a@test.com' },
        { id: 'or-2', campaignId: 'campaign-1', contactEmail: 'b@test.com' },
      ];

      mockCampaignRepository.findOne.mockResolvedValue(mockCampaign as Campaign);
      mockOutreachRepository.find.mockResolvedValue(
        mockOutreachRecords as OutreachRecord[],
      );

      const result = await service.getCampaignWithOutreachRecords('acc-1', 'campaign-1');

      expect(result?.campaign).toEqual(mockCampaign);
      expect(result?.outreachRecords).toHaveLength(2);
    });

    it('should return null if campaign not found', async () => {
      mockCampaignRepository.findOne.mockResolvedValue(null);

      const result = await service.getCampaignWithOutreachRecords('acc-1', 'nonexistent');

      expect(result).toBeNull();
    });

    it('should enforce multi-tenant isolation', async () => {
      mockCampaignRepository.findOne.mockResolvedValue(null);

      await service.getCampaignWithOutreachRecords('acc-1', 'campaign-1');

      expect(mockCampaignRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'campaign-1', accountId: 'acc-1' },
      });
    });
  });

  describe('updateCampaignStatus', () => {
    it('should update campaign status with valid transition', async () => {
      const mockCampaign = {
        id: 'campaign-1',
        accountId: 'acc-1',
        status: CampaignStatus.DRAFT,
        canTransitionTo: jest.fn().mockReturnValue(true),
      };

      mockCampaignRepository.findOne.mockResolvedValue(mockCampaign as unknown as Campaign);
      mockCampaignRepository.save.mockResolvedValue({
        ...mockCampaign,
        status: CampaignStatus.SCHEDULED,
      } as unknown as Campaign);

      const result = await service.updateCampaignStatus(
        'acc-1',
        'campaign-1',
        CampaignStatus.SCHEDULED,
      );

      expect(result?.status).toBe(CampaignStatus.SCHEDULED);
    });

    it('should throw error for invalid status transition', async () => {
      const mockCampaign = {
        id: 'campaign-1',
        status: CampaignStatus.COMPLETED,
        canTransitionTo: jest.fn().mockReturnValue(false),
      };

      mockCampaignRepository.findOne.mockResolvedValue(mockCampaign as unknown as Campaign);

      await expect(
        service.updateCampaignStatus('acc-1', 'campaign-1', CampaignStatus.DRAFT),
      ).rejects.toThrow('Invalid status transition');
    });

    it('should set startedAt when transitioning to RUNNING', async () => {
      const mockCampaign = {
        id: 'campaign-1',
        status: CampaignStatus.DRAFT,
        canTransitionTo: jest.fn().mockReturnValue(true),
      };

      mockCampaignRepository.findOne.mockResolvedValue(mockCampaign as unknown as Campaign);
      mockCampaignRepository.save.mockImplementation((c) => Promise.resolve(c as Campaign));

      await service.updateCampaignStatus(
        'acc-1',
        'campaign-1',
        CampaignStatus.RUNNING,
      );

      expect(mockCampaignRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          startedAt: expect.any(Date),
        }),
      );
    });

    it('should set completedAt when transitioning to COMPLETED', async () => {
      const mockCampaign = {
        id: 'campaign-1',
        status: CampaignStatus.RUNNING,
        canTransitionTo: jest.fn().mockReturnValue(true),
      };

      mockCampaignRepository.findOne.mockResolvedValue(mockCampaign as unknown as Campaign);
      mockCampaignRepository.save.mockImplementation((c) => Promise.resolve(c as Campaign));

      await service.updateCampaignStatus(
        'acc-1',
        'campaign-1',
        CampaignStatus.COMPLETED,
      );

      expect(mockCampaignRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          completedAt: expect.any(Date),
        }),
      );
    });
  });

  describe('getOutreachRecordsByCampaign', () => {
    it('should return outreach records for a campaign', async () => {
      const mockRecords = [
        { id: 'or-1', status: OutreachStatus.PENDING },
        { id: 'or-2', status: OutreachStatus.SENT },
      ];

      mockOutreachRepository.find.mockResolvedValue(mockRecords as OutreachRecord[]);

      const result = await service.getOutreachRecordsByCampaign('acc-1', 'campaign-1');

      expect(result).toHaveLength(2);
      expect(mockOutreachRepository.find).toHaveBeenCalledWith({
        where: { campaignId: 'campaign-1', accountId: 'acc-1' },
        order: { createdAt: 'ASC' },
      });
    });

    it('should filter by status when provided', async () => {
      mockOutreachRepository.find.mockResolvedValue([]);

      await service.getOutreachRecordsByCampaign('acc-1', 'campaign-1', {
        status: OutreachStatus.PENDING,
      });

      expect(mockOutreachRepository.find).toHaveBeenCalledWith({
        where: {
          campaignId: 'campaign-1',
          accountId: 'acc-1',
          status: OutreachStatus.PENDING,
        },
        order: { createdAt: 'ASC' },
      });
    });
  });

  describe('pauseCampaign', () => {
    it('should pause a running campaign', async () => {
      const mockCampaign = {
        id: 'campaign-1',
        status: CampaignStatus.RUNNING,
        canTransitionTo: jest.fn().mockReturnValue(true),
      };

      mockCampaignRepository.findOne.mockResolvedValue(mockCampaign as unknown as Campaign);
      mockCampaignRepository.save.mockImplementation((c) => Promise.resolve(c as Campaign));

      const result = await service.pauseCampaign('campaign-1');

      expect(result?.status).toBe(CampaignStatus.PAUSED);
      expect(mockCampaignRepository.save).toHaveBeenCalled();
    });

    it('should return null if campaign not found', async () => {
      mockCampaignRepository.findOne.mockResolvedValue(null);

      const result = await service.pauseCampaign('nonexistent');

      expect(result).toBeNull();
    });

    it('should return campaign if already paused', async () => {
      const mockCampaign = {
        id: 'campaign-1',
        status: CampaignStatus.PAUSED,
      };

      mockCampaignRepository.findOne.mockResolvedValue(mockCampaign as unknown as Campaign);

      const result = await service.pauseCampaign('campaign-1');

      expect(result?.status).toBe(CampaignStatus.PAUSED);
      expect(mockCampaignRepository.save).not.toHaveBeenCalled();
    });

    it('should throw error if campaign cannot be paused', async () => {
      const mockCampaign = {
        id: 'campaign-1',
        status: CampaignStatus.COMPLETED,
        canTransitionTo: jest.fn().mockReturnValue(false),
      };

      mockCampaignRepository.findOne.mockResolvedValue(mockCampaign as unknown as Campaign);

      await expect(service.pauseCampaign('campaign-1')).rejects.toThrow(
        'Cannot pause campaign with status completed',
      );
    });
  });

  describe('stopCampaign', () => {
    it('should stop a running campaign', async () => {
      const mockCampaign = {
        id: 'campaign-1',
        status: CampaignStatus.RUNNING,
      };

      mockCampaignRepository.findOne.mockResolvedValue(mockCampaign as unknown as Campaign);
      mockCampaignRepository.save.mockImplementation((c) => Promise.resolve(c as Campaign));

      const result = await service.stopCampaign('campaign-1');

      expect(result?.status).toBe(CampaignStatus.COMPLETED);
      expect(result?.completedAt).toBeInstanceOf(Date);
    });

    it('should return null if campaign not found', async () => {
      mockCampaignRepository.findOne.mockResolvedValue(null);

      const result = await service.stopCampaign('nonexistent');

      expect(result).toBeNull();
    });

    it('should return campaign if already completed', async () => {
      const mockCampaign = {
        id: 'campaign-1',
        status: CampaignStatus.COMPLETED,
      };

      mockCampaignRepository.findOne.mockResolvedValue(mockCampaign as unknown as Campaign);

      const result = await service.stopCampaign('campaign-1');

      expect(result?.status).toBe(CampaignStatus.COMPLETED);
      expect(mockCampaignRepository.save).not.toHaveBeenCalled();
    });

    it('should stop a paused campaign', async () => {
      const mockCampaign = {
        id: 'campaign-1',
        status: CampaignStatus.PAUSED,
      };

      mockCampaignRepository.findOne.mockResolvedValue(mockCampaign as unknown as Campaign);
      mockCampaignRepository.save.mockImplementation((c) => Promise.resolve(c as Campaign));

      const result = await service.stopCampaign('campaign-1');

      expect(result?.status).toBe(CampaignStatus.COMPLETED);
    });
  });

  describe('deduplicateContacts', () => {
    it('should remove contacts that already have pending outreach', async () => {
      const contacts: HubSpotContact[] = [
        { id: '1001', properties: { email: 'existing@test.com' }, createdAt: '', updatedAt: '' },
        { id: '1002', properties: { email: 'new@test.com' }, createdAt: '', updatedAt: '' },
      ];

      mockOutreachRepository.find.mockResolvedValue([
        { hubspotContactId: 1001, status: OutreachStatus.PENDING },
      ] as OutreachRecord[]);

      const result = await service.deduplicateContacts('acc-1', contacts);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1002');
    });

    it('should allow contacts that only have completed outreach', async () => {
      const contacts: HubSpotContact[] = [
        { id: '1001', properties: { email: 'completed@test.com' }, createdAt: '', updatedAt: '' },
      ];

      // Mock returns empty because REPLIED is not in ACTIVE_OUTREACH_STATUSES
      // The query filters for active statuses, so completed outreach won't be returned
      mockOutreachRepository.find.mockResolvedValue([]);

      const result = await service.deduplicateContacts('acc-1', contacts);

      // Should include because previous outreach is completed (replied)
      // and the repository query filtered it out
      expect(result).toHaveLength(1);
    });
  });
});
