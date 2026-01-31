import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AbTestService,
  VariantPerformance,
  AbTestResult,
  WinnerRecommendation,
} from './ab-test.service';
import { OutreachRecord } from '../../entities/outreach-record.entity';
import { MessageVariant } from '../../entities/message-variant.entity';

describe('AbTestService', () => {
  let service: AbTestService;
  let outreachRepository: Repository<OutreachRecord>;
  let variantRepository: Repository<MessageVariant>;

  const mockOutreachRepository = {
    createQueryBuilder: jest.fn(),
    find: jest.fn(),
    count: jest.fn(),
  };

  const mockVariantRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AbTestService,
        {
          provide: getRepositoryToken(OutreachRecord),
          useValue: mockOutreachRepository,
        },
        {
          provide: getRepositoryToken(MessageVariant),
          useValue: mockVariantRepository,
        },
      ],
    }).compile();

    service = module.get<AbTestService>(AbTestService);
    outreachRepository = module.get<Repository<OutreachRecord>>(
      getRepositoryToken(OutreachRecord),
    );
    variantRepository = module.get<Repository<MessageVariant>>(
      getRepositoryToken(MessageVariant),
    );

    jest.clearAllMocks();
  });

  describe('getVariantPerformance', () => {
    const variantGroupId = 'group-123';

    it('should return performance metrics for each variant', async () => {
      const mockRawData = [
        {
          variant_id: 'variant-1',
          variant_index: 0,
          subject: 'Subject A',
          tone: 'professional',
          sent: '100',
          opened: '45',
          clicked: '20',
          replied: '10',
        },
        {
          variant_id: 'variant-2',
          variant_index: 1,
          subject: 'Subject B',
          tone: 'friendly',
          sent: '100',
          opened: '55',
          clicked: '25',
          replied: '15',
        },
      ];

      mockOutreachRepository.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        addGroupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(mockRawData),
      });

      const performance = await service.getVariantPerformance(variantGroupId);

      expect(performance).toHaveLength(2);
      expect(performance[0].variantId).toBe('variant-1');
      expect(performance[0].openRate).toBe(45);
      expect(performance[1].variantId).toBe('variant-2');
      expect(performance[1].openRate).toBe(55);
    });

    it('should calculate rates correctly', async () => {
      const mockRawData = [
        {
          variant_id: 'variant-1',
          variant_index: 0,
          subject: 'Test Subject',
          tone: 'professional',
          sent: '200',
          opened: '80',
          clicked: '30',
          replied: '20',
        },
      ];

      mockOutreachRepository.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        addGroupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(mockRawData),
      });

      const performance = await service.getVariantPerformance(variantGroupId);

      expect(performance[0].openRate).toBe(40); // 80/200 * 100
      expect(performance[0].clickRate).toBe(15); // 30/200 * 100
      expect(performance[0].replyRate).toBe(10); // 20/200 * 100
    });

    it('should handle zero sends gracefully', async () => {
      const mockRawData = [
        {
          variant_id: 'variant-1',
          variant_index: 0,
          subject: 'Test Subject',
          tone: 'professional',
          sent: '0',
          opened: '0',
          clicked: '0',
          replied: '0',
        },
      ];

      mockOutreachRepository.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        addGroupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(mockRawData),
      });

      const performance = await service.getVariantPerformance(variantGroupId);

      expect(performance[0].openRate).toBe(0);
      expect(performance[0].clickRate).toBe(0);
      expect(performance[0].replyRate).toBe(0);
    });
  });

  describe('calculateStatisticalSignificance', () => {
    it('should determine statistical significance for clear winner', async () => {
      // Variant A: 100 sent, 40 opened (40%)
      // Variant B: 100 sent, 55 opened (55%)
      const variantA: VariantPerformance = {
        variantId: 'variant-a',
        variantIndex: 0,
        subject: 'Subject A',
        tone: 'professional',
        sent: 100,
        opened: 40,
        clicked: 20,
        replied: 10,
        openRate: 40,
        clickRate: 20,
        replyRate: 10,
      };

      const variantB: VariantPerformance = {
        variantId: 'variant-b',
        variantIndex: 1,
        subject: 'Subject B',
        tone: 'friendly',
        sent: 100,
        opened: 55,
        clicked: 25,
        replied: 15,
        openRate: 55,
        clickRate: 25,
        replyRate: 15,
      };

      const significance = await service.calculateStatisticalSignificance(
        variantA,
        variantB,
        'openRate',
      );

      expect(significance).toBeDefined();
      expect(significance.pValue).toBeDefined();
      expect(significance.isSignificant).toBeDefined();
      expect(significance.confidenceLevel).toBeDefined();
    });

    it('should return not significant for similar performance', async () => {
      const variantA: VariantPerformance = {
        variantId: 'variant-a',
        variantIndex: 0,
        subject: 'Subject A',
        tone: 'professional',
        sent: 100,
        opened: 45,
        clicked: 20,
        replied: 10,
        openRate: 45,
        clickRate: 20,
        replyRate: 10,
      };

      const variantB: VariantPerformance = {
        variantId: 'variant-b',
        variantIndex: 1,
        subject: 'Subject B',
        tone: 'friendly',
        sent: 100,
        opened: 46,
        clicked: 21,
        replied: 11,
        openRate: 46,
        clickRate: 21,
        replyRate: 11,
      };

      const significance = await service.calculateStatisticalSignificance(
        variantA,
        variantB,
        'openRate',
      );

      expect(significance.isSignificant).toBe(false);
    });

    it('should require minimum sample size', async () => {
      const variantA: VariantPerformance = {
        variantId: 'variant-a',
        variantIndex: 0,
        subject: 'Subject A',
        tone: 'professional',
        sent: 5,
        opened: 3,
        clicked: 1,
        replied: 0,
        openRate: 60,
        clickRate: 20,
        replyRate: 0,
      };

      const variantB: VariantPerformance = {
        variantId: 'variant-b',
        variantIndex: 1,
        subject: 'Subject B',
        tone: 'friendly',
        sent: 5,
        opened: 1,
        clicked: 0,
        replied: 0,
        openRate: 20,
        clickRate: 0,
        replyRate: 0,
      };

      const significance = await service.calculateStatisticalSignificance(
        variantA,
        variantB,
        'openRate',
      );

      expect(significance.isSignificant).toBe(false);
      expect(significance.insufficientData).toBe(true);
    });
  });

  describe('getWinnerRecommendation', () => {
    const variantGroupId = 'group-123';

    it('should recommend best performing variant', async () => {
      const mockRawData = [
        {
          variant_id: 'variant-1',
          variant_index: 0,
          subject: 'Subject A',
          tone: 'professional',
          sent: '500',
          opened: '200',
          clicked: '80',
          replied: '40',
        },
        {
          variant_id: 'variant-2',
          variant_index: 1,
          subject: 'Subject B',
          tone: 'friendly',
          sent: '500',
          opened: '275',
          clicked: '110',
          replied: '55',
        },
      ];

      mockOutreachRepository.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        addGroupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(mockRawData),
      });

      const recommendation = await service.getWinnerRecommendation(variantGroupId);

      expect(recommendation).toBeDefined();
      expect(recommendation.winnerId).toBe('variant-2');
      expect(recommendation.reason).toContain('higher');
    });

    it('should indicate no clear winner when differences are small', async () => {
      const mockRawData = [
        {
          variant_id: 'variant-1',
          variant_index: 0,
          subject: 'Subject A',
          tone: 'professional',
          sent: '100',
          opened: '45',
          clicked: '20',
          replied: '10',
        },
        {
          variant_id: 'variant-2',
          variant_index: 1,
          subject: 'Subject B',
          tone: 'friendly',
          sent: '100',
          opened: '46',
          clicked: '21',
          replied: '11',
        },
      ];

      mockOutreachRepository.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        addGroupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(mockRawData),
      });

      const recommendation = await service.getWinnerRecommendation(variantGroupId);

      expect(recommendation.isSignificant).toBe(false);
    });
  });

  describe('getBestSubjectLines', () => {
    const accountId = 'account-123';

    it('should return top performing subject lines', async () => {
      const mockRawData = [
        { subject: 'Reconnecting after our chat', sent: '50', opened: '30', open_rate: '60' },
        { subject: 'Quick follow-up', sent: '100', opened: '45', open_rate: '45' },
        { subject: 'Checking in', sent: '75', opened: '30', open_rate: '40' },
      ];

      mockOutreachRepository.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        having: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(mockRawData),
      });

      const bestSubjects = await service.getBestSubjectLines(accountId, 10);

      expect(bestSubjects).toHaveLength(3);
      expect(bestSubjects[0].subject).toBe('Reconnecting after our chat');
      expect(bestSubjects[0].openRate).toBe(60);
    });
  });

  describe('getBestSendTimes', () => {
    const accountId = 'account-123';

    it('should return best performing send times', async () => {
      const mockRawData = [
        { hour: '10', day_of_week: '2', sent: '100', opened: '50', open_rate: '50' },
        { hour: '14', day_of_week: '3', sent: '120', opened: '48', open_rate: '40' },
        { hour: '9', day_of_week: '1', sent: '80', opened: '28', open_rate: '35' },
      ];

      mockOutreachRepository.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        addGroupBy: jest.fn().mockReturnThis(),
        having: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(mockRawData),
      });

      const bestTimes = await service.getBestSendTimes(accountId);

      expect(bestTimes).toHaveLength(3);
      expect(bestTimes[0].hour).toBe(10);
      expect(bestTimes[0].dayOfWeek).toBe(2); // Tuesday
      expect(bestTimes[0].openRate).toBe(50);
    });
  });

  describe('getTonePerformance', () => {
    const accountId = 'account-123';

    it('should compare performance by tone', async () => {
      // Data pre-sorted by open rate descending (as the DB would return)
      const mockRawData = [
        { tone: 'friendly', sent: '200', opened: '100', clicked: '45', replied: '25' }, // 50% open rate
        { tone: 'professional', sent: '200', opened: '90', clicked: '40', replied: '20' }, // 45% open rate
        { tone: 'casual', sent: '150', opened: '60', clicked: '25', replied: '15' }, // 40% open rate
      ];

      mockOutreachRepository.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(mockRawData),
      });

      const tonePerformance = await service.getTonePerformance(accountId);

      expect(tonePerformance).toHaveLength(3);
      expect(tonePerformance[0].tone).toBe('friendly'); // Best performer
      expect(tonePerformance[0].openRate).toBe(50);
    });
  });
});
