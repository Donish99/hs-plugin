import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MetricsService } from './metrics.service';
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

describe('MetricsService', () => {
  let service: MetricsService;

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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetricsService,
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
      ],
    }).compile();

    service = module.get<MetricsService>(MetricsService);

    jest.clearAllMocks();
  });

  describe('getCampaignMetrics', () => {
    const campaignId = 'campaign-123';

    it('should calculate campaign metrics correctly', async () => {
      mockOutreachRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder({
          total: '100',
          sent: '90',
          delivered: '85',
          bounced: '5',
          opened: '45',
          clicked: '20',
          replied: '10',
        }),
      );

      mockResponseRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder({
          positive_count: '6',
          meetings_count: '3',
        }),
      );

      const metrics = await service.getCampaignMetrics(campaignId);

      expect(metrics).toBeDefined();
      expect(metrics.totalContacts).toBe(100);
      expect(metrics.sent).toBe(90);
      expect(metrics.delivered).toBe(85);
      expect(metrics.bounced).toBe(5);
      expect(metrics.opened).toBe(45);
      expect(metrics.clicked).toBe(20);
      expect(metrics.replied).toBe(10);
      expect(metrics.positiveResponses).toBe(6);
      expect(metrics.meetingsBooked).toBe(3);
    });

    it('should calculate rates correctly', async () => {
      mockOutreachRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder({
          total: '100',
          sent: '80',
          delivered: '75',
          bounced: '5',
          opened: '40',
          clicked: '16',
          replied: '8',
        }),
      );

      mockResponseRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder({
          positive_count: '4',
          meetings_count: '2',
        }),
      );

      const metrics = await service.getCampaignMetrics(campaignId);

      expect(metrics.openRate).toBe(50); // 40/80 * 100
      expect(metrics.clickRate).toBe(20); // 16/80 * 100
      expect(metrics.replyRate).toBe(10); // 8/80 * 100
      expect(metrics.deliveryRate).toBe(93.75); // 75/80 * 100
      expect(metrics.bounceRate).toBe(6.25); // 5/80 * 100
    });

    it('should handle division by zero for rates when no emails sent', async () => {
      mockOutreachRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder({
          total: '50',
          sent: '0',
          delivered: '0',
          bounced: '0',
          opened: '0',
          clicked: '0',
          replied: '0',
        }),
      );

      mockResponseRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder({
          positive_count: '0',
          meetings_count: '0',
        }),
      );

      const metrics = await service.getCampaignMetrics(campaignId);

      expect(metrics.openRate).toBe(0);
      expect(metrics.clickRate).toBe(0);
      expect(metrics.replyRate).toBe(0);
      expect(metrics.deliveryRate).toBe(0);
      expect(metrics.bounceRate).toBe(0);
    });

    it('should handle empty data (null values)', async () => {
      mockOutreachRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder({
          total: null,
          sent: null,
          delivered: null,
          bounced: null,
          opened: null,
          clicked: null,
          replied: null,
        }),
      );

      mockResponseRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder({
          positive_count: null,
          meetings_count: null,
        }),
      );

      const metrics = await service.getCampaignMetrics(campaignId);

      expect(metrics.totalContacts).toBe(0);
      expect(metrics.sent).toBe(0);
      expect(metrics.openRate).toBe(0);
    });
  });

  describe('getEngagementMetrics', () => {
    const accountId = 'account-123';

    it('should aggregate engagement metrics for an account', async () => {
      mockOutreachRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder({
          sent: '500',
          delivered: '480',
          bounced: '20',
          opened: '200',
          clicked: '80',
          replied: '40',
        }),
      );

      mockResponseRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder({
          positive_count: '25',
          meetings_count: '10',
        }),
      );

      const metrics = await service.getEngagementMetrics(accountId);

      expect(metrics.sent).toBe(500);
      expect(metrics.delivered).toBe(480);
      expect(metrics.bounced).toBe(20);
      expect(metrics.opened).toBe(200);
      expect(metrics.clicked).toBe(80);
      expect(metrics.replied).toBe(40);
      expect(metrics.positiveResponses).toBe(25);
      expect(metrics.meetingsScheduled).toBe(10);
    });

    it('should filter by date range', async () => {
      const mockQb = createMockQueryBuilder({
        sent: '100',
        delivered: '95',
        bounced: '5',
        opened: '50',
        clicked: '20',
        replied: '10',
      });

      mockOutreachRepository.createQueryBuilder.mockReturnValue(mockQb);

      mockResponseRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder({
          positive_count: '5',
          meetings_count: '2',
        }),
      );

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      await service.getEngagementMetrics(accountId, { startDate, endDate });

      expect(mockQb.andWhere).toHaveBeenCalled();
    });
  });

  describe('getTimeSeriesData', () => {
    const accountId = 'account-123';

    it('should return daily time series data', async () => {
      const mockRawData = [
        { date: '2024-01-01', sent: '10', opened: '5', clicked: '2', replied: '1' },
        { date: '2024-01-02', sent: '15', opened: '8', clicked: '4', replied: '2' },
        { date: '2024-01-03', sent: '12', opened: '6', clicked: '3', replied: '1' },
      ];

      mockOutreachRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder(null, mockRawData),
      );

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-03');

      const data = await service.getTimeSeriesData(accountId, 'daily', {
        startDate,
        endDate,
      });

      expect(data).toHaveLength(3);
      expect(data[0].date).toBe('2024-01-01');
      expect(data[0].sent).toBe(10);
      expect(data[0].opened).toBe(5);
      expect(data[1].sent).toBe(15);
    });

    it('should return weekly time series data', async () => {
      const mockRawData = [
        { date: '2024-01-01', sent: '70', opened: '35', clicked: '15', replied: '7' },
        { date: '2024-01-08', sent: '85', opened: '42', clicked: '20', replied: '10' },
      ];

      mockOutreachRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder(null, mockRawData),
      );

      const data = await service.getTimeSeriesData(accountId, 'weekly');

      expect(data).toHaveLength(2);
      expect(data[0].sent).toBe(70);
    });

    it('should handle empty time series data', async () => {
      mockOutreachRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder(null, []),
      );

      const data = await service.getTimeSeriesData(accountId, 'daily');

      expect(data).toEqual([]);
    });
  });

  describe('getTrendAnalysis', () => {
    const accountId = 'account-123';

    it('should calculate positive trend when metrics improve', async () => {
      // Mock for engagement metrics - returns different values for different date ranges
      let callCount = 0;
      mockOutreachRepository.createQueryBuilder.mockImplementation(() => {
        callCount++;
        // First two calls are for current period
        if (callCount <= 1) {
          return createMockQueryBuilder({
            sent: '100',
            delivered: '95',
            bounced: '5',
            opened: '50',
            clicked: '25',
            replied: '15',
          });
        }
        // Third and fourth calls are for previous period
        return createMockQueryBuilder({
          sent: '80',
          delivered: '75',
          bounced: '5',
          opened: '32',
          clicked: '16',
          replied: '8',
        });
      });

      mockResponseRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder({
          positive_count: '10',
          meetings_count: '5',
        }),
      );

      const trend = await service.getTrendAnalysis(accountId, 7);

      expect(trend).toBeDefined();
      expect(trend.sentChange).toBeGreaterThan(0);
      expect(trend.openRateChange).toBeDefined();
    });

    it('should calculate negative trend when metrics decline', async () => {
      let callCount = 0;
      mockOutreachRepository.createQueryBuilder.mockImplementation(() => {
        callCount++;
        if (callCount <= 1) {
          return createMockQueryBuilder({
            sent: '50',
            delivered: '45',
            bounced: '5',
            opened: '20',
            clicked: '8',
            replied: '4',
          });
        }
        return createMockQueryBuilder({
          sent: '100',
          delivered: '95',
          bounced: '5',
          opened: '50',
          clicked: '25',
          replied: '15',
        });
      });

      mockResponseRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder({
          positive_count: '3',
          meetings_count: '1',
        }),
      );

      const trend = await service.getTrendAnalysis(accountId, 7);

      expect(trend.sentChange).toBeLessThan(0);
    });

    it('should handle zero previous period data', async () => {
      let callCount = 0;
      mockOutreachRepository.createQueryBuilder.mockImplementation(() => {
        callCount++;
        if (callCount <= 1) {
          return createMockQueryBuilder({
            sent: '100',
            delivered: '95',
            bounced: '5',
            opened: '50',
            clicked: '25',
            replied: '15',
          });
        }
        return createMockQueryBuilder({
          sent: '0',
          delivered: '0',
          bounced: '0',
          opened: '0',
          clicked: '0',
          replied: '0',
        });
      });

      mockResponseRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder({
          positive_count: '10',
          meetings_count: '5',
        }),
      );

      const trend = await service.getTrendAnalysis(accountId, 7);

      expect(trend).toBeDefined();
    });
  });

  describe('compareCampaigns', () => {
    it('should compare metrics between multiple campaigns', async () => {
      const campaignIds = ['campaign-1', 'campaign-2', 'campaign-3'];

      mockOutreachRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder(null, [
          {
            campaign_id: 'campaign-1',
            total: '100',
            sent: '90',
            opened: '45',
            clicked: '20',
            replied: '10',
          },
          {
            campaign_id: 'campaign-2',
            total: '150',
            sent: '140',
            opened: '84',
            clicked: '42',
            replied: '21',
          },
          {
            campaign_id: 'campaign-3',
            total: '80',
            sent: '75',
            opened: '30',
            clicked: '12',
            replied: '6',
          },
        ]),
      );

      const comparison = await service.compareCampaigns(campaignIds);

      expect(comparison).toHaveLength(3);
      expect(comparison[0].campaignId).toBe('campaign-1');
      expect(comparison[0].openRate).toBe(50); // 45/90 * 100
      expect(comparison[1].campaignId).toBe('campaign-2');
      expect(comparison[1].openRate).toBe(60); // 84/140 * 100
      expect(comparison[2].campaignId).toBe('campaign-3');
      expect(comparison[2].openRate).toBe(40); // 30/75 * 100
    });

    it('should handle empty campaign list', async () => {
      const comparison = await service.compareCampaigns([]);
      expect(comparison).toEqual([]);
    });
  });

  describe('getIndustryBenchmarks', () => {
    it('should return industry benchmark data', async () => {
      const benchmarks = await service.getIndustryBenchmarks();

      expect(benchmarks).toBeDefined();
      expect(benchmarks.openRate).toBeDefined();
      expect(benchmarks.clickRate).toBeDefined();
      expect(benchmarks.replyRate).toBeDefined();
      expect(benchmarks.bounceRate).toBeDefined();
    });

    it('should provide benchmark comparison for account metrics', async () => {
      mockOutreachRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder({
          sent: '1000',
          delivered: '950',
          bounced: '50',
          opened: '300',
          clicked: '100',
          replied: '50',
        }),
      );

      mockResponseRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder({
          positive_count: '30',
          meetings_count: '15',
        }),
      );

      const comparison = await service.getBenchmarkComparison('account-123');

      expect(comparison).toBeDefined();
      expect(comparison.openRate.actual).toBeDefined();
      expect(comparison.openRate.benchmark).toBeDefined();
      expect(comparison.openRate.difference).toBeDefined();
      expect(comparison.openRate.status).toMatch(/above|below|at/);
    });
  });
});
