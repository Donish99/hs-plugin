import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { DormancyRulesService } from './dormancy-rules.service';
import {
  DormancyRule,
  ActionType,
  DormancyCriteria,
} from '../../entities/dormancy-rule.entity';

describe('DormancyRulesService', () => {
  let service: DormancyRulesService;
  let repository: Repository<DormancyRule>;

  const mockAccountId = 'account-uuid-123';

  const mockRule: Partial<DormancyRule> = {
    id: 'rule-uuid-123',
    accountId: mockAccountId,
    name: 'Test Rule',
    isActive: true,
    criteria: {
      min_days_inactive: 30,
      no_email_opens_days: 14,
    },
    actionType: ActionType.EMAIL,
    actionConfig: { tone: 'professional' },
    createdAt: new Date(),
  };

  const mockRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DormancyRulesService,
        {
          provide: getRepositoryToken(DormancyRule),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<DormancyRulesService>(DormancyRulesService);
    repository = module.get<Repository<DormancyRule>>(
      getRepositoryToken(DormancyRule),
    );

    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new dormancy rule', async () => {
      const createDto = {
        name: 'New Rule',
        criteria: { min_days_inactive: 30 },
        actionType: ActionType.EMAIL,
        actionConfig: { tone: 'casual' },
      };

      mockRepository.create.mockReturnValue({ ...createDto, accountId: mockAccountId });
      mockRepository.save.mockResolvedValue({ id: 'new-id', ...createDto, accountId: mockAccountId });

      const result = await service.create(mockAccountId, createDto);

      expect(mockRepository.create).toHaveBeenCalledWith({
        ...createDto,
        accountId: mockAccountId,
        isActive: true,
      });
      expect(mockRepository.save).toHaveBeenCalled();
      expect(result.name).toBe('New Rule');
    });

    it('should validate criteria has at least one condition', async () => {
      const createDto = {
        name: 'Invalid Rule',
        criteria: {},
        actionType: ActionType.EMAIL,
        actionConfig: {},
      };

      await expect(service.create(mockAccountId, createDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should validate min_days_inactive is positive', async () => {
      const createDto = {
        name: 'Invalid Rule',
        criteria: { min_days_inactive: -5 },
        actionType: ActionType.EMAIL,
        actionConfig: {},
      };

      await expect(service.create(mockAccountId, createDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('findAll', () => {
    it('should return all rules for an account', async () => {
      mockRepository.find.mockResolvedValue([mockRule, { ...mockRule, id: 'rule-2' }]);

      const result = await service.findAll(mockAccountId);

      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { accountId: mockAccountId },
        order: { createdAt: 'DESC' },
      });
      expect(result).toHaveLength(2);
    });

    it('should return empty array if no rules exist', async () => {
      mockRepository.find.mockResolvedValue([]);

      const result = await service.findAll(mockAccountId);

      expect(result).toHaveLength(0);
    });

    it('should only return rules for the specified account (multi-tenant isolation)', async () => {
      const otherAccountId = 'other-account-uuid';
      mockRepository.find.mockResolvedValue([]);

      await service.findAll(otherAccountId);

      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { accountId: otherAccountId },
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('findOne', () => {
    it('should return a rule by id', async () => {
      mockRepository.findOne.mockResolvedValue(mockRule);

      const result = await service.findOne(mockAccountId, mockRule.id!);

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockRule.id, accountId: mockAccountId },
      });
      expect(result.name).toBe('Test Rule');
    });

    it('should throw NotFoundException if rule not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(
        service.findOne(mockAccountId, 'nonexistent-id'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should not return rule from different account (multi-tenant isolation)', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(
        service.findOne('different-account', mockRule.id!),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findActive', () => {
    it('should return only active rules', async () => {
      const activeRule = { ...mockRule, isActive: true };
      mockRepository.find.mockResolvedValue([activeRule]);

      const result = await service.findActive(mockAccountId);

      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { accountId: mockAccountId, isActive: true },
      });
      expect(result).toHaveLength(1);
      expect(result[0].isActive).toBe(true);
    });
  });

  describe('update', () => {
    it('should update an existing rule', async () => {
      const updateDto = { name: 'Updated Rule' };
      mockRepository.findOne.mockResolvedValue(mockRule);
      mockRepository.save.mockResolvedValue({ ...mockRule, ...updateDto });

      const result = await service.update(mockAccountId, mockRule.id!, updateDto);

      expect(result.name).toBe('Updated Rule');
    });

    it('should throw NotFoundException if rule not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(
        service.update(mockAccountId, 'nonexistent-id', { name: 'New' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should validate criteria on update', async () => {
      mockRepository.findOne.mockResolvedValue(mockRule);

      await expect(
        service.update(mockAccountId, mockRule.id!, {
          criteria: { min_days_inactive: -10 },
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('delete', () => {
    it('should delete a rule', async () => {
      mockRepository.findOne.mockResolvedValue(mockRule);
      mockRepository.delete.mockResolvedValue({ affected: 1 });

      await service.delete(mockAccountId, mockRule.id!);

      expect(mockRepository.delete).toHaveBeenCalledWith({
        id: mockRule.id,
        accountId: mockAccountId,
      });
    });

    it('should throw NotFoundException if rule not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(
        service.delete(mockAccountId, 'nonexistent-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('toggleActive', () => {
    it('should activate an inactive rule', async () => {
      const inactiveRule = { ...mockRule, isActive: false };
      mockRepository.findOne.mockResolvedValue(inactiveRule);
      mockRepository.save.mockResolvedValue({ ...inactiveRule, isActive: true });

      const result = await service.toggleActive(mockAccountId, mockRule.id!);

      expect(result.isActive).toBe(true);
    });

    it('should deactivate an active rule', async () => {
      const activeRule = { ...mockRule, isActive: true };
      mockRepository.findOne.mockResolvedValue(activeRule);
      mockRepository.save.mockResolvedValue({ ...activeRule, isActive: false });

      const result = await service.toggleActive(mockAccountId, mockRule.id!);

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false }),
      );
    });
  });

  describe('validation', () => {
    it('should validate email opens days is positive', async () => {
      const createDto = {
        name: 'Invalid Rule',
        criteria: { no_email_opens_days: -1 },
        actionType: ActionType.EMAIL,
        actionConfig: {},
      };

      await expect(service.create(mockAccountId, createDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should validate min_lead_score is between 0 and 100', async () => {
      const createDto = {
        name: 'Invalid Rule',
        criteria: { min_lead_score: 150 },
        actionType: ActionType.EMAIL,
        actionConfig: {},
      };

      await expect(service.create(mockAccountId, createDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should accept valid criteria combinations', async () => {
      const createDto = {
        name: 'Valid Rule',
        criteria: {
          min_days_inactive: 30,
          no_email_opens_days: 14,
          no_email_clicks_days: 21,
          min_lead_score: 50,
          deal_stages: ['qualified', 'proposal'],
          exclude_tags: ['vip'],
        },
        actionType: ActionType.EMAIL,
        actionConfig: { tone: 'professional' },
      };

      mockRepository.create.mockReturnValue({ ...createDto, accountId: mockAccountId });
      mockRepository.save.mockResolvedValue({ id: 'id', ...createDto, accountId: mockAccountId });

      const result = await service.create(mockAccountId, createDto);

      expect(result.criteria.min_days_inactive).toBe(30);
    });
  });

  describe('count', () => {
    it('should return count of rules for account', async () => {
      mockRepository.count.mockResolvedValue(5);

      const result = await service.count(mockAccountId);

      expect(mockRepository.count).toHaveBeenCalledWith({
        where: { accountId: mockAccountId },
      });
      expect(result).toBe(5);
    });
  });
});
