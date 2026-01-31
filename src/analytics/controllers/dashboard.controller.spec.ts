import { Test, TestingModule } from '@nestjs/testing';
import { DashboardController } from './dashboard.controller';
import { MetricsService } from '../services/metrics.service';
import { RoiService } from '../services/roi.service';
import { AbTestService } from '../services/ab-test.service';
import { ActivityLogService } from '../services/activity-log.service';

describe('DashboardController', () => {
  let controller: DashboardController;
  let metricsService: MetricsService;
  let roiService: RoiService;
  let abTestService: AbTestService;
  let activityLogService: ActivityLogService;

  const mockMetricsService = {
    getCampaignMetrics: jest.fn(),
    getEngagementMetrics: jest.fn(),
    getTimeSeriesData: jest.fn(),
    getTrendAnalysis: jest.fn(),
    compareCampaigns: jest.fn(),
    getIndustryBenchmarks: jest.fn(),
    getBenchmarkComparison: jest.fn(),
  };

  const mockRoiService = {
    getROIMetrics: jest.fn(),
    getDealAttribution: jest.fn(),
    getCostBreakdown: jest.fn(),
    getCostPerReactivation: jest.fn(),
    getRevenueAttributedByPeriod: jest.fn(),
    getDealStageProgression: jest.fn(),
  };

  const mockAbTestService = {
    getVariantPerformance: jest.fn(),
    getWinnerRecommendation: jest.fn(),
    getBestSubjectLines: jest.fn(),
    getBestSendTimes: jest.fn(),
    getTonePerformance: jest.fn(),
  };

  const mockActivityLogService = {
    getActivityLog: jest.fn(),
    getActivityTypes: jest.fn(),
    exportActivityLog: jest.fn(),
    getRetentionPolicy: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [
        { provide: MetricsService, useValue: mockMetricsService },
        { provide: RoiService, useValue: mockRoiService },
        { provide: AbTestService, useValue: mockAbTestService },
        { provide: ActivityLogService, useValue: mockActivityLogService },
      ],
    }).compile();

    controller = module.get<DashboardController>(DashboardController);
    metricsService = module.get<MetricsService>(MetricsService);
    roiService = module.get<RoiService>(RoiService);
    abTestService = module.get<AbTestService>(AbTestService);
    activityLogService = module.get<ActivityLogService>(ActivityLogService);

    jest.clearAllMocks();
  });

  describe('getDashboardOverview', () => {
    const accountId = 'account-123';

    it('should return dashboard overview with all metrics', async () => {
      const mockEngagementMetrics = {
        sent: 500,
        delivered: 480,
        opened: 200,
        clicked: 80,
        replied: 40,
        openRate: 41.67,
        clickRate: 16.67,
        replyRate: 8.33,
      };

      const mockRoiMetrics = {
        totalCost: 50,
        dealsInfluenced: 15,
        pipelineValue: 150000,
        closedWonValue: 50000,
        roi: 99900,
      };

      const mockTrend = {
        sentChange: 25,
        openRateChange: 5,
        period: '7 days',
      };

      mockMetricsService.getEngagementMetrics.mockResolvedValue(mockEngagementMetrics);
      mockRoiService.getROIMetrics.mockResolvedValue(mockRoiMetrics);
      mockMetricsService.getTrendAnalysis.mockResolvedValue(mockTrend);

      const result = await controller.getDashboardOverview(accountId);

      expect(result).toBeDefined();
      expect(result.engagement).toEqual(mockEngagementMetrics);
      expect(result.roi).toEqual(mockRoiMetrics);
      expect(result.trend).toEqual(mockTrend);
      expect(mockMetricsService.getEngagementMetrics).toHaveBeenCalledWith(
        accountId,
        expect.any(Object),
      );
    });

    it('should filter by date range when provided', async () => {
      mockMetricsService.getEngagementMetrics.mockResolvedValue({});
      mockRoiService.getROIMetrics.mockResolvedValue({});
      mockMetricsService.getTrendAnalysis.mockResolvedValue({});

      const startDate = '2024-01-01';
      const endDate = '2024-01-31';

      await controller.getDashboardOverview(accountId, startDate, endDate);

      expect(mockMetricsService.getEngagementMetrics).toHaveBeenCalledWith(
        accountId,
        expect.objectContaining({
          startDate: expect.any(Date),
          endDate: expect.any(Date),
        }),
      );
    });
  });

  describe('getCampaignMetrics', () => {
    const accountId = 'account-123';
    const campaignId = 'campaign-456';

    it('should return metrics for a specific campaign', async () => {
      const mockMetrics = {
        campaignId,
        totalContacts: 100,
        sent: 90,
        delivered: 85,
        opened: 45,
        clicked: 20,
        replied: 10,
        openRate: 50,
        clickRate: 22.22,
        replyRate: 11.11,
      };

      mockMetricsService.getCampaignMetrics.mockResolvedValue(mockMetrics);

      const result = await controller.getCampaignMetrics(accountId, campaignId);

      expect(result).toEqual(mockMetrics);
      expect(mockMetricsService.getCampaignMetrics).toHaveBeenCalledWith(campaignId);
    });
  });

  describe('getTimeSeriesData', () => {
    const accountId = 'account-123';

    it('should return daily time series data', async () => {
      const mockData = [
        { date: '2024-01-01', sent: 10, opened: 5 },
        { date: '2024-01-02', sent: 15, opened: 8 },
      ];

      mockMetricsService.getTimeSeriesData.mockResolvedValue(mockData);

      const result = await controller.getTimeSeriesData(accountId, 'daily');

      expect(result).toEqual(mockData);
      expect(mockMetricsService.getTimeSeriesData).toHaveBeenCalledWith(
        accountId,
        'daily',
        expect.any(Object),
      );
    });

    it('should return weekly time series data', async () => {
      mockMetricsService.getTimeSeriesData.mockResolvedValue([]);

      await controller.getTimeSeriesData(accountId, 'weekly');

      expect(mockMetricsService.getTimeSeriesData).toHaveBeenCalledWith(
        accountId,
        'weekly',
        expect.any(Object),
      );
    });
  });

  describe('compareCampaigns', () => {
    const accountId = 'account-123';

    it('should compare multiple campaigns', async () => {
      const campaignIds = ['campaign-1', 'campaign-2', 'campaign-3'];
      const mockComparison = [
        { campaignId: 'campaign-1', openRate: 45 },
        { campaignId: 'campaign-2', openRate: 55 },
        { campaignId: 'campaign-3', openRate: 40 },
      ];

      mockMetricsService.compareCampaigns.mockResolvedValue(mockComparison);

      const result = await controller.compareCampaigns(accountId, campaignIds);

      expect(result).toEqual(mockComparison);
      expect(mockMetricsService.compareCampaigns).toHaveBeenCalledWith(campaignIds);
    });
  });

  describe('getRoiMetrics', () => {
    const accountId = 'account-123';

    it('should return ROI metrics', async () => {
      const mockMetrics = {
        totalCost: 100,
        dealsInfluenced: 20,
        pipelineValue: 200000,
        closedWonValue: 75000,
        roi: 74900,
      };

      mockRoiService.getROIMetrics.mockResolvedValue(mockMetrics);

      const result = await controller.getRoiMetrics(accountId);

      expect(result).toEqual(mockMetrics);
    });
  });

  describe('getCostBreakdown', () => {
    const accountId = 'account-123';

    it('should return cost breakdown', async () => {
      const mockBreakdown = {
        emailCost: 1,
        smsCost: 10,
        aiCost: 4.5,
        totalCost: 15.5,
      };

      mockRoiService.getCostBreakdown.mockResolvedValue(mockBreakdown);

      const result = await controller.getCostBreakdown(accountId);

      expect(result).toEqual(mockBreakdown);
    });
  });

  describe('getAbTestResults', () => {
    const accountId = 'account-123';
    const variantGroupId = 'group-456';

    it('should return A/B test results', async () => {
      const mockPerformance = [
        { variantId: 'v1', openRate: 45 },
        { variantId: 'v2', openRate: 55 },
      ];
      const mockRecommendation = {
        winnerId: 'v2',
        reason: 'Higher open rate',
        isSignificant: true,
      };

      mockAbTestService.getVariantPerformance.mockResolvedValue(mockPerformance);
      mockAbTestService.getWinnerRecommendation.mockResolvedValue(mockRecommendation);

      const result = await controller.getAbTestResults(accountId, variantGroupId);

      expect(result.variants).toEqual(mockPerformance);
      expect(result.recommendation).toEqual(mockRecommendation);
    });
  });

  describe('getBestPerformers', () => {
    const accountId = 'account-123';

    it('should return best performing subject lines and send times', async () => {
      const mockSubjects = [{ subject: 'Test', openRate: 60 }];
      const mockSendTimes = [{ hour: 10, dayOfWeek: 2, openRate: 50 }];
      const mockTones = [{ tone: 'friendly', openRate: 55 }];

      mockAbTestService.getBestSubjectLines.mockResolvedValue(mockSubjects);
      mockAbTestService.getBestSendTimes.mockResolvedValue(mockSendTimes);
      mockAbTestService.getTonePerformance.mockResolvedValue(mockTones);

      const result = await controller.getBestPerformers(accountId);

      expect(result.subjectLines).toEqual(mockSubjects);
      expect(result.sendTimes).toEqual(mockSendTimes);
      expect(result.tones).toEqual(mockTones);
    });
  });

  describe('getActivityLog', () => {
    const accountId = 'account-123';

    it('should return paginated activity log', async () => {
      const mockResult = {
        entries: [{ id: '1', eventType: 'email_sent' }],
        total: 100,
        page: 1,
        pageSize: 20,
        totalPages: 5,
      };

      mockActivityLogService.getActivityLog.mockResolvedValue(mockResult);

      const result = await controller.getActivityLog(accountId, 1, 20);

      expect(result).toEqual(mockResult);
      expect(mockActivityLogService.getActivityLog).toHaveBeenCalledWith(
        accountId,
        expect.objectContaining({ page: 1, pageSize: 20 }),
      );
    });

    it('should filter by event type', async () => {
      mockActivityLogService.getActivityLog.mockResolvedValue({ entries: [] });

      await controller.getActivityLog(accountId, 1, 20, 'email_opened');

      expect(mockActivityLogService.getActivityLog).toHaveBeenCalledWith(
        accountId,
        expect.objectContaining({ eventType: 'email_opened' }),
      );
    });
  });

  describe('exportActivityLog', () => {
    const accountId = 'account-123';

    it('should export activity log as CSV', async () => {
      const mockCsv = 'header1,header2\nvalue1,value2';

      mockActivityLogService.exportActivityLog.mockResolvedValue(mockCsv);

      const result = await controller.exportActivityLog(accountId, 'csv');

      expect(result).toBe(mockCsv);
      expect(mockActivityLogService.exportActivityLog).toHaveBeenCalledWith(
        accountId,
        'csv',
        expect.any(Object),
      );
    });

    it('should export activity log as JSON', async () => {
      const mockJson = '[{"id": "1"}]';

      mockActivityLogService.exportActivityLog.mockResolvedValue(mockJson);

      const result = await controller.exportActivityLog(accountId, 'json');

      expect(result).toBe(mockJson);
    });
  });

  describe('getBenchmarks', () => {
    const accountId = 'account-123';

    it('should return benchmark comparison', async () => {
      const mockBenchmarks = {
        openRate: 21.5,
        clickRate: 2.5,
        replyRate: 1.5,
      };
      const mockComparison = {
        openRate: { actual: 45, benchmark: 21.5, difference: 23.5, status: 'above' },
        clickRate: { actual: 10, benchmark: 2.5, difference: 7.5, status: 'above' },
      };

      mockMetricsService.getIndustryBenchmarks.mockResolvedValue(mockBenchmarks);
      mockMetricsService.getBenchmarkComparison.mockResolvedValue(mockComparison);

      const result = await controller.getBenchmarks(accountId);

      expect(result.industry).toEqual(mockBenchmarks);
      expect(result.comparison).toEqual(mockComparison);
    });
  });
});
