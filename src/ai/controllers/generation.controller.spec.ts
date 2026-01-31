import { Test, TestingModule } from '@nestjs/testing';
import { GenerationController } from './generation.controller';
import { GeneratorService, GenerationResult, VariantResult, BatchResult } from '../services/generator.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('GenerationController', () => {
  let controller: GenerationController;
  let generatorService: jest.Mocked<GeneratorService>;

  const mockAccountId = 'account-123';
  const mockPortalId = 123456;
  const mockContactId = '12345';

  const mockGenerationResult: GenerationResult = {
    message: {
      subject: 'Quick check-in',
      body: 'Hi John, hope you are doing well...',
    },
    tone: 'professional',
    usage: {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    },
    context: {
      contactId: mockContactId,
      firstName: 'John',
      lastName: 'Doe',
      company: 'Acme Corp',
      jobTitle: 'VP Sales',
      industry: 'Technology',
      lastContactDate: new Date('2024-10-15'),
      daysSinceContact: 100,
      leadScore: 85,
      emailHistory: [],
      previousInterests: [],
    },
  };

  const mockVariantResult: VariantResult = {
    variants: [
      {
        tone: 'professional',
        message: { subject: 'Professional subject', body: 'Professional body' },
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      },
      {
        tone: 'casual',
        message: { subject: 'Casual subject', body: 'Casual body' },
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      },
    ],
    errors: [],
    totalUsage: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
    context: mockGenerationResult.context,
  };

  const mockGeneratorService = {
    generateMessage: jest.fn(),
    generateVariants: jest.fn(),
    generateWithRetry: jest.fn(),
    generateBatch: jest.fn(),
    validateOutput: jest.fn(),
    estimateCost: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GenerationController],
      providers: [
        { provide: GeneratorService, useValue: mockGeneratorService },
      ],
    }).compile();

    controller = module.get<GenerationController>(GenerationController);
    generatorService = module.get(GeneratorService);

    jest.clearAllMocks();
  });

  describe('generateMessage', () => {
    it('should generate a message for a contact', async () => {
      mockGeneratorService.generateMessage.mockResolvedValue(mockGenerationResult);

      const result = await controller.generateMessage(
        mockAccountId,
        mockPortalId,
        { contactId: mockContactId },
      );

      expect(result.message.subject).toBe('Quick check-in');
      expect(result.tone).toBe('professional');
      expect(mockGeneratorService.generateMessage).toHaveBeenCalledWith(
        mockAccountId,
        mockPortalId,
        mockContactId,
        expect.any(Object),
      );
    });

    it('should pass tone option when provided', async () => {
      mockGeneratorService.generateMessage.mockResolvedValue({
        ...mockGenerationResult,
        tone: 'casual',
      });

      await controller.generateMessage(mockAccountId, mockPortalId, {
        contactId: mockContactId,
        tone: 'casual',
      });

      expect(mockGeneratorService.generateMessage).toHaveBeenCalledWith(
        mockAccountId,
        mockPortalId,
        mockContactId,
        expect.objectContaining({ tone: 'casual' }),
      );
    });

    it('should pass template option when provided', async () => {
      mockGeneratorService.generateMessage.mockResolvedValue(mockGenerationResult);

      await controller.generateMessage(mockAccountId, mockPortalId, {
        contactId: mockContactId,
        template: 'follow-up',
      });

      expect(mockGeneratorService.generateMessage).toHaveBeenCalledWith(
        mockAccountId,
        mockPortalId,
        mockContactId,
        expect.objectContaining({ template: 'follow-up' }),
      );
    });

    it('should throw BadRequestException for missing contactId', async () => {
      await expect(
        controller.generateMessage(mockAccountId, mockPortalId, { contactId: '' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should include estimated cost in response', async () => {
      mockGeneratorService.generateMessage.mockResolvedValue(mockGenerationResult);
      mockGeneratorService.estimateCost.mockReturnValue(0.0015);

      const result = await controller.generateMessage(mockAccountId, mockPortalId, {
        contactId: mockContactId,
      });

      expect(result.estimatedCost).toBeDefined();
    });
  });

  describe('generateVariants', () => {
    it('should generate multiple message variants', async () => {
      mockGeneratorService.generateVariants.mockResolvedValue(mockVariantResult);

      const result = await controller.generateVariants(mockAccountId, mockPortalId, {
        contactId: mockContactId,
        count: 2,
      });

      expect(result.variants).toHaveLength(2);
      expect(result.variants[0].tone).toBe('professional');
      expect(result.variants[1].tone).toBe('casual');
    });

    it('should default to 3 variants', async () => {
      mockGeneratorService.generateVariants.mockResolvedValue(mockVariantResult);

      await controller.generateVariants(mockAccountId, mockPortalId, {
        contactId: mockContactId,
      });

      expect(mockGeneratorService.generateVariants).toHaveBeenCalledWith(
        mockAccountId,
        mockPortalId,
        mockContactId,
        3,
      );
    });

    it('should return total usage and cost', async () => {
      mockGeneratorService.generateVariants.mockResolvedValue(mockVariantResult);
      mockGeneratorService.estimateCost.mockReturnValue(0.003);

      const result = await controller.generateVariants(mockAccountId, mockPortalId, {
        contactId: mockContactId,
      });

      expect(result.totalUsage.totalTokens).toBe(300);
      expect(result.estimatedCost).toBe(0.003);
    });
  });

  describe('generateBatch', () => {
    it('should generate messages for multiple contacts', async () => {
      const mockBatchResult: BatchResult = {
        successful: [
          { contactId: '12345', result: mockGenerationResult },
          { contactId: '12346', result: mockGenerationResult },
        ],
        failed: [],
        totalUsage: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
      };

      mockGeneratorService.generateBatch.mockResolvedValue(mockBatchResult);

      const result = await controller.generateBatch(mockAccountId, mockPortalId, {
        contactIds: ['12345', '12346'],
      });

      expect(result.successful).toHaveLength(2);
      expect(result.failed).toHaveLength(0);
    });

    it('should throw BadRequestException for empty contactIds', async () => {
      await expect(
        controller.generateBatch(mockAccountId, mockPortalId, { contactIds: [] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should limit batch size', async () => {
      const manyContacts = Array(100).fill(null).map((_, i) => `contact-${i}`);

      mockGeneratorService.generateBatch.mockResolvedValue({
        successful: [],
        failed: [],
        totalUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      });

      await controller.generateBatch(mockAccountId, mockPortalId, {
        contactIds: manyContacts,
      });

      // Should be limited to max batch size
      expect(mockGeneratorService.generateBatch).toHaveBeenCalledWith(
        mockAccountId,
        mockPortalId,
        expect.any(Array),
        expect.any(Object),
      );

      const calledContacts = mockGeneratorService.generateBatch.mock.calls[0][2];
      expect(calledContacts.length).toBeLessThanOrEqual(50);
    });

    it('should include summary statistics', async () => {
      const mockBatchResult: BatchResult = {
        successful: [{ contactId: '12345', result: mockGenerationResult }],
        failed: [{ contactId: '12346', error: 'Contact not found' }],
        totalUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      };

      mockGeneratorService.generateBatch.mockResolvedValue(mockBatchResult);
      mockGeneratorService.estimateCost.mockReturnValue(0.0015);

      const result = await controller.generateBatch(mockAccountId, mockPortalId, {
        contactIds: ['12345', '12346'],
      });

      expect(result.summary.total).toBe(2);
      expect(result.summary.succeeded).toBe(1);
      expect(result.summary.failed).toBe(1);
    });
  });

  describe('previewMessage', () => {
    it('should generate a preview without saving', async () => {
      mockGeneratorService.generateMessage.mockResolvedValue(mockGenerationResult);

      const result = await controller.previewMessage(mockAccountId, mockPortalId, {
        contactId: mockContactId,
        tone: 'casual',
      });

      expect(result.message).toBeDefined();
      expect(result.preview).toBe(true);
    });
  });

  describe('validateMessage', () => {
    it('should validate a message', async () => {
      mockGeneratorService.validateOutput.mockReturnValue({
        valid: true,
        errors: [],
        warnings: [],
      });

      const result = await controller.validateMessage({
        subject: 'Test subject',
        body: 'Test body content',
      });

      expect(result.valid).toBe(true);
    });

    it('should return validation errors', async () => {
      mockGeneratorService.validateOutput.mockReturnValue({
        valid: false,
        errors: ['Subject is required'],
        warnings: [],
      });

      const result = await controller.validateMessage({
        subject: '',
        body: 'Test body',
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Subject is required');
    });
  });

  describe('estimateCost', () => {
    it('should estimate cost for a single message', async () => {
      mockGeneratorService.estimateCost.mockReturnValue(0.0015);

      const result = await controller.estimateCost({
        type: 'single',
        contactCount: 1,
      });

      expect(result.estimatedCost).toBeGreaterThan(0);
    });

    it('should estimate cost for batch generation', async () => {
      mockGeneratorService.estimateCost.mockReturnValue(0.015);

      const result = await controller.estimateCost({
        type: 'batch',
        contactCount: 10,
      });

      expect(result.estimatedCost).toBeGreaterThan(0);
      expect(result.contactCount).toBe(10);
    });

    it('should estimate cost for variants', async () => {
      mockGeneratorService.estimateCost.mockReturnValue(0.0045);

      const result = await controller.estimateCost({
        type: 'variants',
        contactCount: 1,
        variantCount: 3,
      });

      expect(result.estimatedCost).toBeGreaterThan(0);
    });
  });
});
