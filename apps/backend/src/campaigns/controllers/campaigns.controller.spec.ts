import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CampaignsController } from './campaigns.controller';
import { CampaignService } from '../services/campaign.service';
import { ScannerService } from '../services/scanner.service';
import { DormancyDetectionService } from '../services/dormancy-detection.service';
import { CampaignStatus } from '../../entities/campaign.entity';

describe('CampaignsController', () => {
  let controller: CampaignsController;
  let campaignService: jest.Mocked<CampaignService>;
  let scannerService: jest.Mocked<ScannerService>;

  const mockAccountId = 'acc-123';
  const mockPortalId = 12345;
  const mockCampaignId = 'camp-456';

  const mockCampaign = {
    id: mockCampaignId,
    accountId: mockAccountId,
    name: 'Test Campaign',
    status: CampaignStatus.DRAFT,
    totalContacts: 10,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockCampaignService = {
      createCampaignFromScan: jest.fn(),
      findCampaignsByAccount: jest.fn(),
      getCampaignWithOutreachRecords: jest.fn(),
      updateCampaignStatus: jest.fn(),
      pauseCampaign: jest.fn(),
      stopCampaign: jest.fn(),
      getOutreachRecordsByCampaign: jest.fn(),
      deleteCampaign: jest.fn(),
    };

    const mockScannerService = {
      scanForRule: jest.fn(),
      scanAllRules: jest.fn(),
    };

    const mockDormancyDetectionService = {
      calculateDormancyScore: jest.fn(),
      prioritizeContacts: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CampaignsController],
      providers: [
        {
          provide: CampaignService,
          useValue: mockCampaignService,
        },
        {
          provide: ScannerService,
          useValue: mockScannerService,
        },
        {
          provide: DormancyDetectionService,
          useValue: mockDormancyDetectionService,
        },
      ],
    }).compile();

    controller = module.get<CampaignsController>(CampaignsController);
    campaignService = module.get(CampaignService);
    scannerService = module.get(ScannerService);
  });

  describe('createCampaign', () => {
    it('should create a campaign with provided leadIds', async () => {
      campaignService.createCampaignFromScan.mockResolvedValue({
        campaign: mockCampaign as any,
        outreachRecordsCreated: 10,
        contactsSkipped: 0,
      });

      const result = await controller.createCampaign(mockAccountId, mockPortalId, {
        name: 'Test Campaign',
        leadIds: ['1', '2', '3'],
      });

      expect(result.id).toBe(mockCampaignId);
      expect(result.name).toBe('Test Campaign');
    });

    it('should create campaign from rule when ruleId provided without leadIds', async () => {
      const mockContacts = [
        { id: '1', properties: { email: 'test@example.com' }, createdAt: '', updatedAt: '' },
        { id: '2', properties: { email: 'test2@example.com' }, createdAt: '', updatedAt: '' },
      ];

      scannerService.scanForRule.mockResolvedValue({
        ruleId: 'rule-123',
        contacts: mockContacts,
        totalFound: 2,
        scannedAt: new Date(),
      });

      campaignService.createCampaignFromScan.mockResolvedValue({
        campaign: mockCampaign as any,
        outreachRecordsCreated: 2,
        contactsSkipped: 0,
      });

      const result = await controller.createCampaign(mockAccountId, mockPortalId, {
        name: 'Test Campaign',
        ruleId: 'rule-123',
      });

      expect(scannerService.scanForRule).toHaveBeenCalledWith(
        mockAccountId,
        mockPortalId,
        'rule-123',
        {},
      );
      expect(result.id).toBe(mockCampaignId);
    });

    it('should return error when rule has no matching contacts', async () => {
      scannerService.scanForRule.mockResolvedValue({
        ruleId: 'rule-123',
        contacts: [],
        totalFound: 0,
        scannedAt: new Date(),
      });

      const result = await controller.createCampaign(mockAccountId, mockPortalId, {
        name: 'Test Campaign',
        ruleId: 'rule-123',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('No contacts found');
    });

    it('should return error when no valid contacts', async () => {
      campaignService.createCampaignFromScan.mockResolvedValue({
        campaign: null,
        outreachRecordsCreated: 0,
        contactsSkipped: 5,
      });

      const result = await controller.createCampaign(mockAccountId, mockPortalId, {
        name: 'Test Campaign',
        leadIds: ['1', '2', '3'],
      });

      expect(result.success).toBe(false);
      expect(result.contactsSkipped).toBe(5);
    });

    it('should return error when no leadIds and no ruleId provided', async () => {
      const result = await controller.createCampaign(mockAccountId, mockPortalId, {
        name: 'Test Campaign',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('No contacts provided');
    });
  });

  describe('listCampaigns', () => {
    it('should return list of campaigns', async () => {
      campaignService.findCampaignsByAccount.mockResolvedValue([mockCampaign as any]);

      const result = await controller.listCampaigns(mockAccountId, {});

      expect(result.campaigns).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('getCampaign', () => {
    it('should return campaign with outreach records', async () => {
      campaignService.getCampaignWithOutreachRecords.mockResolvedValue({
        campaign: {
          ...mockCampaign,
          emailsSent: 5,
          emailsOpened: 3,
          emailsReplied: 1,
        } as any,
        outreachRecords: [],
      });

      const result = await controller.getCampaign(mockAccountId, mockCampaignId);

      expect(result.id).toBe(mockCampaignId);
      expect(result.leads).toBeDefined();
      expect(result.metrics).toBeDefined();
    });

    it('should throw NotFoundException if campaign not found', async () => {
      campaignService.getCampaignWithOutreachRecords.mockResolvedValue(null);

      await expect(
        controller.getCampaign(mockAccountId, mockCampaignId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateCampaignStatus', () => {
    it('should update campaign status', async () => {
      campaignService.updateCampaignStatus.mockResolvedValue({
        ...mockCampaign,
        status: CampaignStatus.SCHEDULED,
      } as any);

      const result = await controller.updateCampaignStatus(
        mockAccountId,
        mockCampaignId,
        { status: CampaignStatus.SCHEDULED },
      );

      expect(result.success).toBe(true);
      expect(result.campaign.status).toBe(CampaignStatus.SCHEDULED);
    });
  });

  describe('pauseCampaign', () => {
    it('should pause a campaign', async () => {
      campaignService.pauseCampaign.mockResolvedValue({
        ...mockCampaign,
        status: CampaignStatus.PAUSED,
      } as any);

      const result = await controller.pauseCampaign(mockAccountId, mockCampaignId);

      expect(result.success).toBe(true);
    });
  });

  describe('stopCampaign', () => {
    it('should stop a campaign', async () => {
      campaignService.stopCampaign.mockResolvedValue({
        ...mockCampaign,
        status: CampaignStatus.COMPLETED,
      } as any);

      const result = await controller.stopCampaign(mockAccountId, mockCampaignId);

      expect(result.success).toBe(true);
    });
  });
});
