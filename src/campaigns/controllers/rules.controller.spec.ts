import { Test, TestingModule } from '@nestjs/testing';
import { RulesController } from './rules.controller';
import { DormancyRulesService } from '../services/dormancy-rules.service';
import { ActionType } from '../../entities/dormancy-rule.entity';

describe('RulesController', () => {
  let controller: RulesController;
  let service: DormancyRulesService;

  const mockAccountId = 'account-uuid-123';

  const mockRule = {
    id: 'rule-uuid-123',
    accountId: mockAccountId,
    name: 'Test Rule',
    isActive: true,
    criteria: { min_days_inactive: 30 },
    actionType: ActionType.EMAIL,
    actionConfig: { tone: 'professional' },
    createdAt: new Date(),
  };

  const mockService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    toggleActive: jest.fn(),
    count: jest.fn(),
  };

  const mockRequest = {
    portalId: 12345,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RulesController],
      providers: [
        {
          provide: DormancyRulesService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<RulesController>(RulesController);
    service = module.get<DormancyRulesService>(DormancyRulesService);

    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new rule', async () => {
      const createDto = {
        name: 'New Rule',
        criteria: { min_days_inactive: 30 },
        actionType: ActionType.EMAIL,
        actionConfig: { tone: 'casual' },
      };

      mockService.create.mockResolvedValue({ id: 'new-id', ...createDto });

      const result = await controller.create(mockAccountId, createDto);

      expect(mockService.create).toHaveBeenCalledWith(mockAccountId, createDto);
      expect(result.name).toBe('New Rule');
    });
  });

  describe('findAll', () => {
    it('should return all rules for account', async () => {
      mockService.findAll.mockResolvedValue([mockRule]);

      const result = await controller.findAll(mockAccountId);

      expect(mockService.findAll).toHaveBeenCalledWith(mockAccountId);
      expect(result).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('should return a single rule', async () => {
      mockService.findOne.mockResolvedValue(mockRule);

      const result = await controller.findOne(mockAccountId, mockRule.id);

      expect(mockService.findOne).toHaveBeenCalledWith(mockAccountId, mockRule.id);
      expect(result.id).toBe(mockRule.id);
    });
  });

  describe('update', () => {
    it('should update a rule', async () => {
      const updateDto = { name: 'Updated Rule' };
      mockService.update.mockResolvedValue({ ...mockRule, ...updateDto });

      const result = await controller.update(mockAccountId, mockRule.id, updateDto);

      expect(mockService.update).toHaveBeenCalledWith(mockAccountId, mockRule.id, updateDto);
      expect(result.name).toBe('Updated Rule');
    });
  });

  describe('delete', () => {
    it('should delete a rule', async () => {
      mockService.delete.mockResolvedValue(undefined);

      await controller.delete(mockAccountId, mockRule.id);

      expect(mockService.delete).toHaveBeenCalledWith(mockAccountId, mockRule.id);
    });
  });

  describe('toggleActive', () => {
    it('should toggle rule active status', async () => {
      mockService.toggleActive.mockResolvedValue({ ...mockRule, isActive: false });

      const result = await controller.toggleActive(mockAccountId, mockRule.id);

      expect(mockService.toggleActive).toHaveBeenCalledWith(mockAccountId, mockRule.id);
      expect(result.isActive).toBe(false);
    });
  });
});
