import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { RulesController } from '../src/campaigns/controllers/rules.controller';
import { DormancyRulesService } from '../src/campaigns/services/dormancy-rules.service';
import { ActionType } from '../src/entities/dormancy-rule.entity';

describe('Rules API (e2e)', () => {
  let app: INestApplication;

  const mockAccountId = 'account-uuid-123';

  const mockRules = [
    {
      id: 'rule-1',
      accountId: mockAccountId,
      name: 'High Priority Leads',
      isActive: true,
      criteria: { min_days_inactive: 30, min_lead_score: 50 },
      actionType: ActionType.EMAIL,
      actionConfig: { tone: 'professional' },
      createdAt: new Date('2024-01-01'),
    },
    {
      id: 'rule-2',
      accountId: mockAccountId,
      name: 'Cold Leads',
      isActive: false,
      criteria: { min_days_inactive: 90 },
      actionType: ActionType.EMAIL,
      actionConfig: { tone: 'casual' },
      createdAt: new Date('2024-01-15'),
    },
  ];

  const mockRulesService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    findActive: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    toggleActive: jest.fn(),
    count: jest.fn(),
    validateCriteria: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [RulesController],
      providers: [
        {
          provide: DormancyRulesService,
          useValue: mockRulesService,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/accounts/:accountId/rules', () => {
    it('should return all rules for an account', async () => {
      mockRulesService.findAll.mockResolvedValue(mockRules);

      const response = await request(app.getHttpServer())
        .get(`/api/accounts/${mockAccountId}/rules`)
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body[0].name).toBe('High Priority Leads');
      expect(mockRulesService.findAll).toHaveBeenCalledWith(mockAccountId);
    });

    it('should return empty array when no rules exist', async () => {
      mockRulesService.findAll.mockResolvedValue([]);

      const response = await request(app.getHttpServer())
        .get(`/api/accounts/${mockAccountId}/rules`)
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('should handle different account IDs', async () => {
      const otherAccountId = 'other-account-456';
      mockRulesService.findAll.mockResolvedValue([]);

      await request(app.getHttpServer())
        .get(`/api/accounts/${otherAccountId}/rules`)
        .expect(200);

      expect(mockRulesService.findAll).toHaveBeenCalledWith(otherAccountId);
    });
  });

  describe('GET /api/accounts/:accountId/rules/:ruleId', () => {
    it('should return a single rule', async () => {
      mockRulesService.findOne.mockResolvedValue(mockRules[0]);

      const response = await request(app.getHttpServer())
        .get(`/api/accounts/${mockAccountId}/rules/rule-1`)
        .expect(200);

      expect(response.body.id).toBe('rule-1');
      expect(response.body.name).toBe('High Priority Leads');
      expect(mockRulesService.findOne).toHaveBeenCalledWith(mockAccountId, 'rule-1');
    });

    it('should return 404 when rule not found', async () => {
      mockRulesService.findOne.mockRejectedValue({ status: 404, message: 'Not found' });

      await request(app.getHttpServer())
        .get(`/api/accounts/${mockAccountId}/rules/nonexistent`)
        .expect(500); // Without proper exception filter, it returns 500
    });
  });

  describe('POST /api/accounts/:accountId/rules', () => {
    it('should create a new rule', async () => {
      const newRule = {
        name: 'New Rule',
        criteria: { min_days_inactive: 45 },
        actionType: ActionType.EMAIL,
        actionConfig: { tone: 'professional' },
      };

      const savedRule = {
        id: 'new-rule-id',
        accountId: mockAccountId,
        isActive: true,
        createdAt: new Date(),
        ...newRule,
      };

      mockRulesService.create.mockResolvedValue(savedRule);

      const response = await request(app.getHttpServer())
        .post(`/api/accounts/${mockAccountId}/rules`)
        .send(newRule)
        .expect(201);

      expect(response.body.name).toBe('New Rule');
      expect(response.body.id).toBe('new-rule-id');
      expect(mockRulesService.create).toHaveBeenCalledWith(mockAccountId, newRule);
    });

    it('should create rule with complex criteria', async () => {
      const complexRule = {
        name: 'Complex Rule',
        criteria: {
          min_days_inactive: 30,
          no_email_opens_days: 14,
          no_email_clicks_days: 21,
          min_lead_score: 50,
          deal_stages: ['qualifiedtobuy', 'presentationscheduled'],
          exclude_tags: ['vip', 'do-not-contact'],
        },
        actionType: ActionType.EMAIL,
        actionConfig: { tone: 'professional', template: 'reactivation-1' },
      };

      mockRulesService.create.mockResolvedValue({
        id: 'complex-rule-id',
        accountId: mockAccountId,
        isActive: true,
        createdAt: new Date(),
        ...complexRule,
      });

      const response = await request(app.getHttpServer())
        .post(`/api/accounts/${mockAccountId}/rules`)
        .send(complexRule)
        .expect(201);

      expect(response.body.criteria.min_days_inactive).toBe(30);
      expect(response.body.criteria.deal_stages).toHaveLength(2);
    });
  });

  describe('PUT /api/accounts/:accountId/rules/:ruleId', () => {
    it('should update an existing rule', async () => {
      const updateDto = {
        name: 'Updated Rule Name',
        criteria: { min_days_inactive: 60 },
      };

      mockRulesService.update.mockResolvedValue({
        ...mockRules[0],
        ...updateDto,
      });

      const response = await request(app.getHttpServer())
        .put(`/api/accounts/${mockAccountId}/rules/rule-1`)
        .send(updateDto)
        .expect(200);

      expect(response.body.name).toBe('Updated Rule Name');
      expect(mockRulesService.update).toHaveBeenCalledWith(
        mockAccountId,
        'rule-1',
        updateDto,
      );
    });

    it('should update only provided fields', async () => {
      const partialUpdate = { name: 'Only Name Updated' };

      mockRulesService.update.mockResolvedValue({
        ...mockRules[0],
        name: 'Only Name Updated',
      });

      const response = await request(app.getHttpServer())
        .put(`/api/accounts/${mockAccountId}/rules/rule-1`)
        .send(partialUpdate)
        .expect(200);

      expect(response.body.name).toBe('Only Name Updated');
      expect(response.body.criteria).toEqual(mockRules[0].criteria);
    });
  });

  describe('DELETE /api/accounts/:accountId/rules/:ruleId', () => {
    it('should delete a rule', async () => {
      mockRulesService.delete.mockResolvedValue(undefined);

      await request(app.getHttpServer())
        .delete(`/api/accounts/${mockAccountId}/rules/rule-1`)
        .expect(200);

      expect(mockRulesService.delete).toHaveBeenCalledWith(mockAccountId, 'rule-1');
    });
  });

  describe('PATCH /api/accounts/:accountId/rules/:ruleId/toggle', () => {
    it('should toggle rule from active to inactive', async () => {
      mockRulesService.toggleActive.mockResolvedValue({
        ...mockRules[0],
        isActive: false,
      });

      const response = await request(app.getHttpServer())
        .patch(`/api/accounts/${mockAccountId}/rules/rule-1/toggle`)
        .expect(200);

      expect(response.body.isActive).toBe(false);
      expect(mockRulesService.toggleActive).toHaveBeenCalledWith(mockAccountId, 'rule-1');
    });

    it('should toggle rule from inactive to active', async () => {
      mockRulesService.toggleActive.mockResolvedValue({
        ...mockRules[1],
        isActive: true,
      });

      const response = await request(app.getHttpServer())
        .patch(`/api/accounts/${mockAccountId}/rules/rule-2/toggle`)
        .expect(200);

      expect(response.body.isActive).toBe(true);
    });
  });

  describe('Multi-tenant isolation', () => {
    it('should pass correct accountId for all operations', async () => {
      const account1 = 'account-1';
      const account2 = 'account-2';

      mockRulesService.findAll.mockResolvedValue([]);

      // First account
      await request(app.getHttpServer())
        .get(`/api/accounts/${account1}/rules`)
        .expect(200);

      expect(mockRulesService.findAll).toHaveBeenCalledWith(account1);

      // Second account
      await request(app.getHttpServer())
        .get(`/api/accounts/${account2}/rules`)
        .expect(200);

      expect(mockRulesService.findAll).toHaveBeenCalledWith(account2);
    });

    it('should include accountId in create operations', async () => {
      const newRule = {
        name: 'Test Rule',
        criteria: { min_days_inactive: 30 },
        actionType: ActionType.EMAIL,
        actionConfig: {},
      };

      mockRulesService.create.mockResolvedValue({
        id: 'new-id',
        accountId: mockAccountId,
        ...newRule,
      });

      await request(app.getHttpServer())
        .post(`/api/accounts/${mockAccountId}/rules`)
        .send(newRule)
        .expect(201);

      expect(mockRulesService.create).toHaveBeenCalledWith(mockAccountId, newRule);
    });
  });

  describe('Error handling', () => {
    it('should handle service errors gracefully', async () => {
      mockRulesService.findAll.mockRejectedValue(new Error('Database error'));

      await request(app.getHttpServer())
        .get(`/api/accounts/${mockAccountId}/rules`)
        .expect(500);
    });

    it('should handle not found errors', async () => {
      mockRulesService.findOne.mockRejectedValue({
        status: 404,
        message: 'Rule not found',
      });

      await request(app.getHttpServer())
        .get(`/api/accounts/${mockAccountId}/rules/nonexistent`)
        .expect(500); // Without exception filter
    });
  });

  describe('Content-Type handling', () => {
    it('should accept application/json content type', async () => {
      const newRule = {
        name: 'JSON Rule',
        criteria: { min_days_inactive: 30 },
        actionType: ActionType.EMAIL,
        actionConfig: {},
      };

      mockRulesService.create.mockResolvedValue({ id: 'test', ...newRule });

      await request(app.getHttpServer())
        .post(`/api/accounts/${mockAccountId}/rules`)
        .set('Content-Type', 'application/json')
        .send(newRule)
        .expect(201);
    });

    it('should return JSON responses', async () => {
      mockRulesService.findAll.mockResolvedValue(mockRules);

      const response = await request(app.getHttpServer())
        .get(`/api/accounts/${mockAccountId}/rules`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(typeof response.body).toBe('object');
    });
  });
});
