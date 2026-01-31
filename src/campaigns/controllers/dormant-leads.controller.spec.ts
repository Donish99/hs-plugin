import { Test, TestingModule } from '@nestjs/testing';
import { DormantLeadsController } from './dormant-leads.controller';
import { ScannerService, HubSpotContact, ScanResult } from '../services/scanner.service';
import { DormancyDetectionService, PrioritizedContact, DormancyReport } from '../services/dormancy-detection.service';
import { DormancyRulesService } from '../services/dormancy-rules.service';
import { CampaignService } from '../services/campaign.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Response } from 'express';

describe('DormantLeadsController', () => {
  let controller: DormantLeadsController;
  let scannerService: jest.Mocked<ScannerService>;
  let dormancyDetectionService: jest.Mocked<DormancyDetectionService>;
  let rulesService: jest.Mocked<DormancyRulesService>;
  let campaignService: jest.Mocked<CampaignService>;

  const mockAccountId = 'account-123';
  const mockPortalId = 12345;

  const mockContact: HubSpotContact = {
    id: '1001',
    properties: {
      email: 'john@example.com',
      firstname: 'John',
      lastname: 'Doe',
      company: 'Acme Corp',
      hubspotscore: '75',
      notes_last_contacted: '2024-01-01',
    },
    createdAt: '2024-01-01',
    updatedAt: '2024-03-01',
  };

  const mockScanResult: ScanResult = {
    ruleId: 'rule-123',
    contacts: [mockContact],
    totalFound: 1,
    scannedAt: new Date(),
  };

  const mockPrioritizedContact: PrioritizedContact = {
    contact: mockContact,
    dormancyScore: {
      totalScore: 75,
      factors: {
        daysSinceLastContact: 150,
        daysSinceLastOpen: null,
        daysSinceLastClick: null,
        daysSinceLastVisit: null,
        lastContactScore: 75,
        emailEngagementScore: 100,
        websiteEngagementScore: 100,
      },
      calculatedAt: new Date(),
    },
    leadScore: 75,
    dealValue: 50000,
    priorityScore: 80,
    lastEngagementDate: new Date('2024-01-01'),
  };

  const mockScannerService = {
    scanForRule: jest.fn(),
    scanAllRules: jest.fn(),
  };

  const mockDormancyDetectionService = {
    calculateDormancyScore: jest.fn(),
    prioritizeContacts: jest.fn(),
    generateDormancyReport: jest.fn(),
    getContactEngagementData: jest.fn(),
  };

  const mockRulesService = {
    findOne: jest.fn(),
    findAll: jest.fn(),
    findActive: jest.fn(),
  };

  const mockCampaignService = {
    createCampaignFromScan: jest.fn(),
    deduplicateContacts: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DormantLeadsController],
      providers: [
        { provide: ScannerService, useValue: mockScannerService },
        { provide: DormancyDetectionService, useValue: mockDormancyDetectionService },
        { provide: DormancyRulesService, useValue: mockRulesService },
        { provide: CampaignService, useValue: mockCampaignService },
      ],
    }).compile();

    controller = module.get<DormantLeadsController>(DormantLeadsController);
    scannerService = module.get(ScannerService);
    dormancyDetectionService = module.get(DormancyDetectionService);
    rulesService = module.get(DormancyRulesService);
    campaignService = module.get(CampaignService);

    jest.clearAllMocks();
  });

  describe('getDormantLeads', () => {
    it('should return dormant leads for an account', async () => {
      mockScannerService.scanAllRules.mockResolvedValue([mockScanResult]);
      mockDormancyDetectionService.prioritizeContacts.mockReturnValue([mockPrioritizedContact]);

      const result = await controller.getDormantLeads(mockAccountId, mockPortalId, {});

      expect(result.contacts).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(mockScannerService.scanAllRules).toHaveBeenCalledWith(
        mockAccountId,
        mockPortalId,
        expect.any(Object),
      );
    });

    it('should filter by rule ID when provided', async () => {
      const ruleId = 'rule-123';
      mockRulesService.findOne.mockResolvedValue({ id: ruleId, isActive: true });
      mockScannerService.scanForRule.mockResolvedValue(mockScanResult);
      mockDormancyDetectionService.prioritizeContacts.mockReturnValue([mockPrioritizedContact]);

      const result = await controller.getDormantLeads(mockAccountId, mockPortalId, {
        ruleId,
      });

      expect(mockScannerService.scanForRule).toHaveBeenCalledWith(
        mockAccountId,
        mockPortalId,
        ruleId,
        expect.any(Object),
      );
      expect(result.contacts).toHaveLength(1);
    });

    it('should throw NotFoundException for invalid rule ID', async () => {
      mockRulesService.findOne.mockResolvedValue(null);

      await expect(
        controller.getDormantLeads(mockAccountId, mockPortalId, { ruleId: 'invalid' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should sort by dormancy score descending by default', async () => {
      mockScannerService.scanAllRules.mockResolvedValue([mockScanResult]);
      mockDormancyDetectionService.prioritizeContacts.mockReturnValue([mockPrioritizedContact]);

      await controller.getDormantLeads(mockAccountId, mockPortalId, {});

      expect(mockDormancyDetectionService.prioritizeContacts).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          sortBy: 'dormancyScore',
          sortOrder: 'desc',
        }),
      );
    });

    it('should support custom sorting options', async () => {
      mockScannerService.scanAllRules.mockResolvedValue([mockScanResult]);
      mockDormancyDetectionService.prioritizeContacts.mockReturnValue([mockPrioritizedContact]);

      await controller.getDormantLeads(mockAccountId, mockPortalId, {
        sortBy: 'leadScore',
        sortOrder: 'asc',
      });

      expect(mockDormancyDetectionService.prioritizeContacts).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          sortBy: 'leadScore',
          sortOrder: 'asc',
        }),
      );
    });

    it('should support pagination', async () => {
      const manyContacts = Array(25).fill(mockPrioritizedContact);
      mockScannerService.scanAllRules.mockResolvedValue([mockScanResult]);
      mockDormancyDetectionService.prioritizeContacts.mockReturnValue(manyContacts);

      const result = await controller.getDormantLeads(mockAccountId, mockPortalId, {
        page: 2,
        limit: 10,
      });

      expect(result.contacts).toHaveLength(10);
      expect(result.page).toBe(2);
      expect(result.totalPages).toBe(3);
    });

    it('should return empty result when no dormant leads found', async () => {
      mockScannerService.scanAllRules.mockResolvedValue([]);

      const result = await controller.getDormantLeads(mockAccountId, mockPortalId, {});

      expect(result.contacts).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('getDormantLeadDetails', () => {
    it('should return detailed engagement data for a contact', async () => {
      const contactId = '1001';
      mockScannerService.scanAllRules.mockResolvedValue([mockScanResult]);
      mockDormancyDetectionService.calculateDormancyScore.mockReturnValue(
        mockPrioritizedContact.dormancyScore,
      );
      mockDormancyDetectionService.getContactEngagementData.mockReturnValue({
        contactId,
        email: 'john@example.com',
        name: 'John Doe',
        company: 'Acme Corp',
        daysSinceLastContact: 150,
        daysSinceLastOpen: null,
        daysSinceLastClick: null,
        daysSinceLastVisit: null,
        daysSinceLastReply: null,
        totalContactAttempts: 5,
        leadScore: 75,
        dealValue: 50000,
      });

      const result = await controller.getDormantLeadDetails(
        mockAccountId,
        mockPortalId,
        contactId,
      );

      expect(result.contactId).toBe(contactId);
      expect(result.dormancyScore).toBeDefined();
      expect(result.engagementData).toBeDefined();
    });

    it('should throw NotFoundException when contact not found', async () => {
      mockScannerService.scanAllRules.mockResolvedValue([]);

      await expect(
        controller.getDormantLeadDetails(mockAccountId, mockPortalId, 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getDormancyReport', () => {
    it('should generate a dormancy report for a rule', async () => {
      const ruleId = 'rule-123';
      const mockReport: DormancyReport = {
        ruleId,
        totalContacts: 10,
        averageDormancyScore: 65,
        totalDealValue: 500000,
        dormancyDistribution: { high: 3, medium: 5, low: 2 },
        leadScoreDistribution: { high: 2, medium: 6, low: 2 },
        topPriorityContacts: [mockPrioritizedContact],
        generatedAt: new Date(),
      };

      mockRulesService.findOne.mockResolvedValue({ id: ruleId, isActive: true });
      mockScannerService.scanForRule.mockResolvedValue(mockScanResult);
      mockDormancyDetectionService.generateDormancyReport.mockReturnValue(mockReport);

      const result = await controller.getDormancyReport(mockAccountId, mockPortalId, ruleId);

      expect(result.ruleId).toBe(ruleId);
      expect(result.totalContacts).toBe(10);
      expect(result.dormancyDistribution).toBeDefined();
    });

    it('should throw NotFoundException for invalid rule', async () => {
      mockRulesService.findOne.mockResolvedValue(null);

      await expect(
        controller.getDormancyReport(mockAccountId, mockPortalId, 'invalid'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createCampaignFromDormantLeads', () => {
    it('should create a campaign from selected contacts', async () => {
      const contactIds = ['1001', '1002'];
      mockScannerService.scanAllRules.mockResolvedValue([mockScanResult]);
      mockCampaignService.createCampaignFromScan.mockResolvedValue({
        campaign: { id: 'campaign-1', totalContacts: 2 },
        outreachRecordsCreated: 2,
        contactsSkipped: 0,
      });

      const result = await controller.createCampaignFromDormantLeads(
        mockAccountId,
        mockPortalId,
        { contactIds, name: 'Test Campaign' },
      );

      expect(result.campaign).toBeDefined();
      expect(result.outreachRecordsCreated).toBe(2);
    });

    it('should validate contact IDs are provided', async () => {
      await expect(
        controller.createCampaignFromDormantLeads(mockAccountId, mockPortalId, {
          contactIds: [],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should deduplicate contacts before creating campaign', async () => {
      const contactIds = ['1001', '1002'];
      mockScannerService.scanAllRules.mockResolvedValue([mockScanResult]);
      mockCampaignService.deduplicateContacts.mockResolvedValue([mockContact]);
      mockCampaignService.createCampaignFromScan.mockResolvedValue({
        campaign: { id: 'campaign-1' },
        outreachRecordsCreated: 1,
        contactsSkipped: 1,
      });

      await controller.createCampaignFromDormantLeads(mockAccountId, mockPortalId, {
        contactIds,
        deduplicate: true,
      });

      expect(mockCampaignService.deduplicateContacts).toHaveBeenCalled();
    });
  });

  describe('exportDormantLeads', () => {
    it('should export dormant leads as CSV', async () => {
      mockScannerService.scanAllRules.mockResolvedValue([mockScanResult]);
      mockDormancyDetectionService.prioritizeContacts.mockReturnValue([mockPrioritizedContact]);
      mockDormancyDetectionService.getContactEngagementData.mockReturnValue({
        contactId: '1001',
        email: 'john@example.com',
        name: 'John Doe',
        company: 'Acme Corp',
        daysSinceLastContact: 150,
        daysSinceLastOpen: null,
        daysSinceLastClick: null,
        daysSinceLastVisit: null,
        daysSinceLastReply: null,
        totalContactAttempts: 5,
        leadScore: 75,
        dealValue: 50000,
      });

      const mockResponse = {
        setHeader: jest.fn(),
        send: jest.fn(),
      } as unknown as Response;

      await controller.exportDormantLeads(mockAccountId, mockPortalId, {}, mockResponse);

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/csv',
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('attachment; filename=dormant-leads-'),
      );
      expect(mockResponse.send).toHaveBeenCalled();
    });

    it('should include proper CSV headers', async () => {
      mockScannerService.scanAllRules.mockResolvedValue([mockScanResult]);
      mockDormancyDetectionService.prioritizeContacts.mockReturnValue([mockPrioritizedContact]);
      mockDormancyDetectionService.getContactEngagementData.mockReturnValue({
        contactId: '1001',
        email: 'john@example.com',
        name: 'John Doe',
        company: 'Acme Corp',
        daysSinceLastContact: 150,
        daysSinceLastOpen: null,
        daysSinceLastClick: null,
        daysSinceLastVisit: null,
        daysSinceLastReply: null,
        totalContactAttempts: 5,
        leadScore: 75,
        dealValue: 50000,
      });

      const sendMock = jest.fn();
      const mockResponse = {
        setHeader: jest.fn(),
        send: sendMock,
      } as unknown as Response;

      await controller.exportDormantLeads(mockAccountId, mockPortalId, {}, mockResponse);

      const csvContent = sendMock.mock.calls[0][0];
      expect(csvContent).toContain('Contact ID');
      expect(csvContent).toContain('Email');
      expect(csvContent).toContain('Name');
      expect(csvContent).toContain('Company');
      expect(csvContent).toContain('Dormancy Score');
    });
  });

  describe('bulkSelectDormantLeads', () => {
    it('should return contacts matching bulk selection criteria', async () => {
      mockScannerService.scanAllRules.mockResolvedValue([mockScanResult]);
      mockDormancyDetectionService.prioritizeContacts.mockReturnValue([mockPrioritizedContact]);

      const result = await controller.bulkSelectDormantLeads(mockAccountId, mockPortalId, {
        minDormancyScore: 50,
        maxContacts: 100,
      });

      expect(result.selectedContacts).toBeDefined();
      expect(Array.isArray(result.selectedContactIds)).toBe(true);
    });

    it('should filter by minimum dormancy score', async () => {
      const lowScoreContact = {
        ...mockPrioritizedContact,
        dormancyScore: { ...mockPrioritizedContact.dormancyScore, totalScore: 30 },
      };
      const highScoreContact = {
        ...mockPrioritizedContact,
        contact: { ...mockContact, id: '1002' },
        dormancyScore: { ...mockPrioritizedContact.dormancyScore, totalScore: 80 },
      };

      mockScannerService.scanAllRules.mockResolvedValue([mockScanResult]);
      mockDormancyDetectionService.prioritizeContacts.mockReturnValue([
        lowScoreContact,
        highScoreContact,
      ]);

      const result = await controller.bulkSelectDormantLeads(mockAccountId, mockPortalId, {
        minDormancyScore: 50,
      });

      // Only high score contact should be included
      expect(result.selectedContactIds).toContain('1002');
      expect(result.selectedContactIds).not.toContain('1001');
    });

    it('should respect max contacts limit', async () => {
      const manyContacts = Array(50)
        .fill(null)
        .map((_, i) => ({
          ...mockPrioritizedContact,
          contact: { ...mockContact, id: `${1001 + i}` },
        }));

      mockScannerService.scanAllRules.mockResolvedValue([mockScanResult]);
      mockDormancyDetectionService.prioritizeContacts.mockReturnValue(manyContacts);

      const result = await controller.bulkSelectDormantLeads(mockAccountId, mockPortalId, {
        maxContacts: 10,
      });

      expect(result.selectedContactIds).toHaveLength(10);
    });
  });
});
