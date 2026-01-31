import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { RoiService } from './roi.service';
import { OutreachRecord } from '../../entities/outreach-record.entity';
import { Campaign } from '../../entities/campaign.entity';
import { Response } from '../../entities/response.entity';

/**
 * Create a mock query builder with all chained methods
 */
function createMockQueryBuilder(getRawOneValue?: unknown, getRawManyValue?: unknown[]) {
  const mockQb = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue(getRawOneValue),
    getRawMany: jest.fn().mockResolvedValue(getRawManyValue || []),
    getCount: jest.fn().mockResolvedValue(0),
  };
  return mockQb;
}

describe('RoiService', () => {
  let service: RoiService;

  const mockOutreachRepository = {
    createQueryBuilder: jest.fn(),
    find: jest.fn(),
    count: jest.fn(),
  };

  const mockCampaignRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockResponseRepository = {
    createQueryBuilder: jest.fn(),
    find: jest.fn(),
    count: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: unknown) => {
      const config: Record<string, unknown> = {
        AI_COST_PER_1K_TOKENS: 0.03,
        EMAIL_COST_PER_SEND: 0.001,
        SMS_COST_PER_SEND: 0.05,
      };
      return config[key] ?? defaultValue;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoiService,
        {
          provide: getRepositoryToken(OutreachRecord),
          useValue: mockOutreachRepository,
        },
        {
          provide: getRepositoryToken(Campaign),
          useValue: mockCampaignRepository,
        },
        {
          provide: getRepositoryToken(Response),
          useValue: mockResponseRepository,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<RoiService>(RoiService);

    jest.clearAllMocks();
  });

  describe('getROIMetrics', () => {
    const accountId = 'account-123';

    it('should calculate ROI metrics correctly', async () => {
      mockOutreachRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder({
          total_emails: '1000',
          total_sms: '200',
          total_prompt_tokens: '50000',
          total_completion_tokens: '25000',
        }),
      );

      mockResponseRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder({
          deals_influenced: '15',
          pipeline_value: '150000',
          closed_won_value: '50000',
          deals_advanced: '8',
          deals_reopened: '3',
        }),
      );

      const metrics = await service.getROIMetrics(accountId);

      expect(metrics).toBeDefined();
      expect(metrics.dealsInfluenced).toBe(15);
      expect(metrics.pipelineValue).toBe(150000);
      expect(metrics.closedWonValue).toBe(50000);
      expect(metrics.totalCost).toBeGreaterThan(0);
      expect(metrics.roi).toBeDefined();
    });

    it('should calculate positive ROI when revenue exceeds costs', async () => {
      mockOutreachRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder({
          total_emails: '100',
          total_sms: '0',
          total_prompt_tokens: '5000',
          total_completion_tokens: '2500',
        }),
      );

      mockResponseRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder({
          deals_influenced: '5',
          pipeline_value: '50000',
          closed_won_value: '10000',
          deals_advanced: '3',
          deals_reopened: '2',
        }),
      );

      const metrics = await service.getROIMetrics(accountId);

      // Cost should be minimal: ~$0.10 for emails + ~$0.23 for AI
      expect(metrics.totalCost).toBeLessThan(1);
      // ROI = (10000 - cost) / cost * 100
      expect(metrics.roi).toBeGreaterThan(1000);
    });

    it('should handle zero closed deals (negative ROI)', async () => {
      mockOutreachRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder({
          total_emails: '500',
          total_sms: '100',
          total_prompt_tokens: '25000',
          total_completion_tokens: '12500',
        }),
      );

      mockResponseRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder({
          deals_influenced: '3',
          pipeline_value: '30000',
          closed_won_value: '0',
          deals_advanced: '2',
          deals_reopened: '1',
        }),
      );

      const metrics = await service.getROIMetrics(accountId);

      expect(metrics.closedWonValue).toBe(0);
      expect(metrics.roi).toBe(-100); // All cost, no revenue
    });

    it('should handle missing data gracefully', async () => {
      mockOutreachRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder({
          total_emails: null,
          total_sms: null,
          total_prompt_tokens: null,
          total_completion_tokens: null,
        }),
      );

      mockResponseRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder({
          deals_influenced: null,
          pipeline_value: null,
          closed_won_value: null,
          deals_advanced: null,
          deals_reopened: null,
        }),
      );

      const metrics = await service.getROIMetrics(accountId);

      expect(metrics.totalCost).toBe(0);
      expect(metrics.dealsInfluenced).toBe(0);
      expect(metrics.pipelineValue).toBe(0);
      expect(metrics.closedWonValue).toBe(0);
      expect(metrics.roi).toBe(0);
    });
  });

  describe('getDealAttribution', () => {
    const accountId = 'account-123';

    it('should return deal attribution details', async () => {
      mockResponseRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder(null, [
          {
            hubspot_deal_id: '12345',
            contact_name: 'John Doe',
            company_name: 'Acme Inc',
            campaign_name: 'Q4 Reactivation',
            response_type: 'meeting_booked',
            created_at: new Date('2024-01-15'),
          },
          {
            hubspot_deal_id: '12346',
            contact_name: 'Jane Smith',
            company_name: 'Tech Corp',
            campaign_name: 'Q4 Reactivation',
            response_type: 'email_reply',
            created_at: new Date('2024-01-16'),
          },
        ]),
      );

      const attributions = await service.getDealAttribution(accountId);

      expect(attributions).toHaveLength(2);
      expect(attributions[0].hubspotDealId).toBe('12345');
      expect(attributions[0].contactName).toBe('John Doe');
      expect(attributions[1].companyName).toBe('Tech Corp');
    });

    it('should filter by campaign when provided', async () => {
      const mockQb = createMockQueryBuilder(null, []);
      mockResponseRepository.createQueryBuilder.mockReturnValue(mockQb);

      await service.getDealAttribution(accountId, 'campaign-456');

      expect(mockQb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('campaign_id'),
        expect.objectContaining({ campaignId: 'campaign-456' }),
      );
    });

    it('should return empty array when no deals attributed', async () => {
      mockResponseRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder(null, []),
      );

      const attributions = await service.getDealAttribution(accountId);

      expect(attributions).toEqual([]);
    });
  });

  describe('getCostBreakdown', () => {
    const accountId = 'account-123';

    it('should calculate cost breakdown correctly', async () => {
      mockOutreachRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder({
          total_emails: '1000',
          total_sms: '200',
          total_prompt_tokens: '100000',
          total_completion_tokens: '50000',
        }),
      );

      const breakdown = await service.getCostBreakdown(accountId);

      expect(breakdown).toBeDefined();
      expect(breakdown.emailCost).toBe(1); // 1000 * $0.001
      expect(breakdown.smsCost).toBe(10); // 200 * $0.05
      expect(breakdown.aiCost).toBe(4.5); // 150000 / 1000 * $0.03
      expect(breakdown.totalCost).toBe(15.5);
    });

    it('should handle zero usage', async () => {
      mockOutreachRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder({
          total_emails: '0',
          total_sms: '0',
          total_prompt_tokens: '0',
          total_completion_tokens: '0',
        }),
      );

      const breakdown = await service.getCostBreakdown(accountId);

      expect(breakdown.emailCost).toBe(0);
      expect(breakdown.smsCost).toBe(0);
      expect(breakdown.aiCost).toBe(0);
      expect(breakdown.totalCost).toBe(0);
    });
  });

  describe('getCostPerReactivation', () => {
    const accountId = 'account-123';

    it('should calculate cost per reactivation correctly', async () => {
      mockOutreachRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder({
          total_emails: '500',
          total_sms: '0',
          total_prompt_tokens: '25000',
          total_completion_tokens: '12500',
          reactivated_count: '25',
        }),
      );

      const costPerReactivation = await service.getCostPerReactivation(accountId);

      // Total cost: $0.50 (emails) + $1.125 (AI) = $1.625
      // Cost per reactivation: $1.625 / 25 = $0.065
      expect(costPerReactivation).toBeDefined();
      expect(costPerReactivation).toBeGreaterThan(0);
    });

    it('should return null when no reactivations', async () => {
      mockOutreachRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder({
          total_emails: '500',
          total_sms: '0',
          total_prompt_tokens: '25000',
          total_completion_tokens: '12500',
          reactivated_count: '0',
        }),
      );

      const costPerReactivation = await service.getCostPerReactivation(accountId);

      expect(costPerReactivation).toBeNull();
    });
  });

  describe('getRevenueAttributedByPeriod', () => {
    const accountId = 'account-123';

    it('should return revenue attributed by time period', async () => {
      mockResponseRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder(null, [
          { period: '2024-01', revenue: '25000' },
          { period: '2024-02', revenue: '35000' },
          { period: '2024-03', revenue: '45000' },
        ]),
      );

      const revenueByPeriod = await service.getRevenueAttributedByPeriod(
        accountId,
        'monthly',
      );

      expect(revenueByPeriod).toHaveLength(3);
      expect(revenueByPeriod[0].period).toBe('2024-01');
      expect(revenueByPeriod[0].revenue).toBe(25000);
      expect(revenueByPeriod[2].revenue).toBe(45000);
    });

    it('should handle empty revenue data', async () => {
      mockResponseRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder(null, []),
      );

      const revenueByPeriod = await service.getRevenueAttributedByPeriod(accountId);

      expect(revenueByPeriod).toEqual([]);
    });
  });

  describe('getDealStageProgression', () => {
    const accountId = 'account-123';

    it('should track deal stage progression', async () => {
      mockResponseRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder(null, [
          { stage: 'reopened', count: '10' },
          { stage: 'qualified', count: '8' },
          { stage: 'proposal', count: '5' },
          { stage: 'negotiation', count: '3' },
          { stage: 'closed_won', count: '2' },
        ]),
      );

      const progression = await service.getDealStageProgression(accountId);

      expect(progression).toBeDefined();
      expect(progression.reopened).toBe(10);
      expect(progression.qualified).toBe(8);
      expect(progression.closedWon).toBe(2);
    });
  });
});
