import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ActivityLogService } from './activity-log.service';
import { OutreachRecord } from '../../entities/outreach-record.entity';
import { Response } from '../../entities/response.entity';
import { Campaign } from '../../entities/campaign.entity';

/**
 * Create a mock query builder with all chained methods
 */
function createMockQueryBuilder(
  getRawManyValue?: unknown[],
  getCountValue: number = 0,
) {
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
    delete: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue(null),
    getRawMany: jest.fn().mockResolvedValue(getRawManyValue || []),
    getCount: jest.fn().mockResolvedValue(getCountValue),
    execute: jest.fn().mockResolvedValue({ affected: 150 }),
  };
  return mockQb;
}

describe('ActivityLogService', () => {
  let service: ActivityLogService;

  const mockOutreachRepository = {
    createQueryBuilder: jest.fn(),
    find: jest.fn(),
    count: jest.fn(),
  };

  const mockResponseRepository = {
    createQueryBuilder: jest.fn(),
    find: jest.fn(),
  };

  const mockCampaignRepository = {
    createQueryBuilder: jest.fn(),
    find: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityLogService,
        {
          provide: getRepositoryToken(OutreachRecord),
          useValue: mockOutreachRepository,
        },
        {
          provide: getRepositoryToken(Response),
          useValue: mockResponseRepository,
        },
        {
          provide: getRepositoryToken(Campaign),
          useValue: mockCampaignRepository,
        },
      ],
    }).compile();

    service = module.get<ActivityLogService>(ActivityLogService);

    jest.clearAllMocks();
  });

  describe('getActivityLog', () => {
    const accountId = 'account-123';

    it('should return paginated activity log entries', async () => {
      const mockOutreachData = [
        {
          id: 'outreach-1',
          event_type: 'email_sent',
          contact_name: 'John Doe',
          contact_email: 'john@example.com',
          campaign_id: 'campaign-1',
          campaign_name: 'Q4 Reactivation',
          created_at: new Date('2024-01-15T10:00:00Z'),
        },
        {
          id: 'outreach-2',
          event_type: 'email_opened',
          contact_name: 'Jane Smith',
          contact_email: 'jane@example.com',
          campaign_id: 'campaign-1',
          campaign_name: 'Q4 Reactivation',
          created_at: new Date('2024-01-15T11:00:00Z'),
        },
      ];

      mockOutreachRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder(mockOutreachData, 100),
      );

      const result = await service.getActivityLog(accountId, {
        page: 1,
        pageSize: 20,
      });

      expect(result.entries).toHaveLength(2);
      expect(result.entries[0].eventType).toBe('email_sent');
      expect(result.entries[0].contactName).toBe('John Doe');
      expect(result.total).toBe(100);
      expect(result.page).toBe(1);
    });

    it('should filter by event type', async () => {
      const mockQb = createMockQueryBuilder([], 0);
      mockOutreachRepository.createQueryBuilder.mockReturnValue(mockQb);

      await service.getActivityLog(accountId, {
        eventType: 'email_opened',
      });

      expect(mockQb.andWhere).toHaveBeenCalled();
    });

    it('should filter by contact', async () => {
      const mockQb = createMockQueryBuilder([], 0);
      mockOutreachRepository.createQueryBuilder.mockReturnValue(mockQb);

      await service.getActivityLog(accountId, {
        contactEmail: 'john@example.com',
      });

      expect(mockQb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('contact_email'),
        expect.objectContaining({ contactEmail: 'john@example.com' }),
      );
    });

    it('should filter by campaign', async () => {
      const mockQb = createMockQueryBuilder([], 0);
      mockOutreachRepository.createQueryBuilder.mockReturnValue(mockQb);

      await service.getActivityLog(accountId, {
        campaignId: 'campaign-123',
      });

      expect(mockQb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('campaign_id'),
        expect.objectContaining({ campaignId: 'campaign-123' }),
      );
    });

    it('should filter by date range', async () => {
      const mockQb = createMockQueryBuilder([], 0);
      mockOutreachRepository.createQueryBuilder.mockReturnValue(mockQb);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      await service.getActivityLog(accountId, { startDate, endDate });

      // andWhere is called multiple times (main query + count query)
      expect(mockQb.andWhere).toHaveBeenCalled();
      // Verify startDate and endDate filters were applied
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('created_at'),
        expect.objectContaining({ startDate }),
      );
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('created_at'),
        expect.objectContaining({ endDate }),
      );
    });

    it('should support search across multiple fields', async () => {
      const mockQb = createMockQueryBuilder([], 0);
      mockOutreachRepository.createQueryBuilder.mockReturnValue(mockQb);

      await service.getActivityLog(accountId, {
        search: 'john',
      });

      expect(mockQb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('ILIKE'),
        expect.objectContaining({ search: '%john%' }),
      );
    });
  });

  describe('getActivityTypes', () => {
    it('should return all available activity types', () => {
      const types = service.getActivityTypes();

      expect(types).toContain('email_sent');
      expect(types).toContain('email_opened');
      expect(types).toContain('email_clicked');
      expect(types).toContain('email_replied');
      expect(types).toContain('email_bounced');
      expect(types).toContain('sms_sent');
      expect(types).toContain('meeting_booked');
      expect(types).toContain('campaign_started');
      expect(types).toContain('campaign_completed');
    });
  });

  describe('exportActivityLog', () => {
    const accountId = 'account-123';

    it('should export activity log as CSV', async () => {
      const mockOutreachData = [
        {
          id: 'outreach-1',
          event_type: 'email_sent',
          contact_name: 'John Doe',
          contact_email: 'john@example.com',
          campaign_name: 'Q4 Reactivation',
          created_at: new Date('2024-01-15T10:00:00Z'),
        },
      ];

      mockOutreachRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder(mockOutreachData),
      );

      const csv = await service.exportActivityLog(accountId, 'csv');

      expect(csv).toContain('Event Type');
      expect(csv).toContain('Contact Name');
      expect(csv).toContain('email_sent');
      expect(csv).toContain('John Doe');
    });

    it('should export activity log as JSON', async () => {
      const mockOutreachData = [
        {
          id: 'outreach-1',
          event_type: 'email_sent',
          contact_name: 'John Doe',
          contact_email: 'john@example.com',
          campaign_name: 'Q4 Reactivation',
          created_at: new Date('2024-01-15T10:00:00Z'),
        },
      ];

      mockOutreachRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder(mockOutreachData),
      );

      const json = await service.exportActivityLog(accountId, 'json');

      const parsed = JSON.parse(json);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].eventType).toBe('email_sent');
    });
  });

  describe('getRetentionPolicy', () => {
    it('should return 90 day retention policy', () => {
      const policy = service.getRetentionPolicy();

      expect(policy.retentionDays).toBe(90);
    });
  });

  describe('cleanupOldEntries', () => {
    const accountId = 'account-123';

    it('should delete entries older than retention period', async () => {
      const mockQb = createMockQueryBuilder([]);
      mockOutreachRepository.createQueryBuilder.mockReturnValue(mockQb);

      const deleted = await service.cleanupOldEntries(accountId);

      expect(deleted).toBe(150);
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('created_at'),
        expect.any(Object),
      );
    });
  });
});
