import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VariantService, StoredVariant, VariantGroupResult } from './variant.service';
import { MessageVariant } from '../../entities/message-variant.entity';

describe('VariantService', () => {
  let service: VariantService;
  let repository: jest.Mocked<Repository<MessageVariant>>;

  const mockAccountId = 'account-123';
  const mockContactId = 12345;
  const mockGroupId = 'group-uuid-123';

  const mockVariants: StoredVariant[] = [
    {
      tone: 'professional',
      subject: 'Quick check-in on your project',
      body: 'Hi John, I wanted to follow up on our last conversation...',
      promptTokens: 100,
      completionTokens: 50,
    },
    {
      tone: 'casual',
      subject: 'Hey John!',
      body: 'Hey! Hope things are going well...',
      promptTokens: 100,
      completionTokens: 45,
    },
    {
      tone: 'curious',
      subject: 'Question about your recent project',
      body: 'Hi John, I was curious about how things are going...',
      promptTokens: 100,
      completionTokens: 55,
    },
  ];

  const mockSavedVariants: MessageVariant[] = mockVariants.map((v, index) => {
    const variant = new MessageVariant();
    variant.id = `variant-${index}`;
    variant.accountId = mockAccountId;
    variant.hubspotContactId = mockContactId;
    variant.variantGroupId = mockGroupId;
    variant.variantIndex = index;
    variant.tone = v.tone;
    variant.subject = v.subject;
    variant.body = v.body;
    variant.promptTokens = v.promptTokens;
    variant.completionTokens = v.completionTokens;
    variant.isSelected = false;
    variant.isSent = false;
    variant.createdAt = new Date();
    return variant;
  });

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VariantService,
        {
          provide: getRepositoryToken(MessageVariant),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<VariantService>(VariantService);
    repository = module.get(getRepositoryToken(MessageVariant));

    jest.clearAllMocks();
  });

  describe('storeVariants', () => {
    it('should store multiple variants with a common group ID', async () => {
      mockRepository.create.mockImplementation((data) => ({ ...data } as MessageVariant));
      mockRepository.save.mockResolvedValue(mockSavedVariants);

      const result = await service.storeVariants(
        mockAccountId,
        mockContactId,
        mockVariants,
        { aiModel: 'gpt-4o' },
      );

      expect(result.variantGroupId).toBeDefined();
      expect(result.variants).toHaveLength(3);
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should assign sequential variant indices', async () => {
      mockRepository.create.mockImplementation((data) => ({ ...data } as MessageVariant));
      mockRepository.save.mockResolvedValue(mockSavedVariants);

      const result = await service.storeVariants(
        mockAccountId,
        mockContactId,
        mockVariants,
      );

      expect(result.variants[0].variantIndex).toBe(0);
      expect(result.variants[1].variantIndex).toBe(1);
      expect(result.variants[2].variantIndex).toBe(2);
    });

    it('should include context snapshot when provided', async () => {
      const contextSnapshot = { firstName: 'John', company: 'Acme Corp' };
      mockRepository.create.mockImplementation((data) => ({ ...data } as MessageVariant));
      mockRepository.save.mockResolvedValue(mockSavedVariants);

      await service.storeVariants(
        mockAccountId,
        mockContactId,
        mockVariants,
        { contextSnapshot },
      );

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ contextSnapshot }),
      );
    });
  });

  describe('getVariantsByGroup', () => {
    it('should retrieve all variants for a group', async () => {
      mockRepository.find.mockResolvedValue(mockSavedVariants);

      const result = await service.getVariantsByGroup(mockGroupId);

      expect(result).toHaveLength(3);
      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { variantGroupId: mockGroupId },
        order: { variantIndex: 'ASC' },
      });
    });

    it('should return empty array when no variants found', async () => {
      mockRepository.find.mockResolvedValue([]);

      const result = await service.getVariantsByGroup('nonexistent-group');

      expect(result).toHaveLength(0);
    });
  });

  describe('getVariantsByContact', () => {
    it('should retrieve all variants for a contact', async () => {
      mockRepository.find.mockResolvedValue(mockSavedVariants);

      const result = await service.getVariantsByContact(mockAccountId, mockContactId);

      expect(result).toHaveLength(3);
      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { accountId: mockAccountId, hubspotContactId: mockContactId },
        order: { createdAt: 'DESC', variantIndex: 'ASC' },
      });
    });
  });

  describe('selectVariant', () => {
    it('should mark a variant as selected', async () => {
      const variant = mockSavedVariants[0];
      mockRepository.findOne.mockResolvedValue(variant);
      mockRepository.update.mockResolvedValue({ affected: 1 });
      mockRepository.save.mockResolvedValue({ ...variant, isSelected: true });

      const result = await service.selectVariant(variant.id);

      expect(result).toBeDefined();
      expect(mockRepository.update).toHaveBeenCalledWith(
        { variantGroupId: variant.variantGroupId },
        { isSelected: false },
      );
    });

    it('should unselect other variants in the same group', async () => {
      const variant = mockSavedVariants[1];
      mockRepository.findOne.mockResolvedValue(variant);
      mockRepository.update.mockResolvedValue({ affected: 2 });
      mockRepository.save.mockResolvedValue({ ...variant, isSelected: true });

      await service.selectVariant(variant.id);

      expect(mockRepository.update).toHaveBeenCalledWith(
        { variantGroupId: variant.variantGroupId },
        { isSelected: false },
      );
    });

    it('should return null if variant not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.selectVariant('nonexistent-id');

      expect(result).toBeNull();
    });
  });

  describe('markVariantAsSent', () => {
    it('should mark a variant as sent', async () => {
      const variant = mockSavedVariants[0];
      mockRepository.findOne.mockResolvedValue(variant);
      mockRepository.save.mockResolvedValue({ ...variant, isSent: true, isSelected: true });

      const result = await service.markVariantAsSent(variant.id);

      expect(result).toBeDefined();
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ isSent: true, isSelected: true }),
      );
    });
  });

  describe('getVariantById', () => {
    it('should retrieve a variant by ID', async () => {
      const variant = mockSavedVariants[0];
      mockRepository.findOne.mockResolvedValue(variant);

      const result = await service.getVariantById(variant.id);

      expect(result).toEqual(variant);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: variant.id },
      });
    });
  });

  describe('deleteVariantGroup', () => {
    it('should delete all variants in a group', async () => {
      mockRepository.delete.mockResolvedValue({ affected: 3 });

      const result = await service.deleteVariantGroup(mockGroupId);

      expect(result).toBe(3);
      expect(mockRepository.delete).toHaveBeenCalledWith({
        variantGroupId: mockGroupId,
      });
    });
  });

  describe('getVariantAnalytics', () => {
    it('should calculate analytics for a group', async () => {
      // Create deep copies to avoid mutating the shared mock data
      const variants = mockSavedVariants.map((v) => ({
        ...v,
        isSelected: false,
        isSent: false,
        getTotalTokens: () => (v.promptTokens || 0) + (v.completionTokens || 0),
      }));
      variants[0].isSelected = true;
      variants[0].isSent = true;
      mockRepository.find.mockResolvedValue(variants);

      const result = await service.getVariantAnalytics(mockGroupId);

      expect(result.totalVariants).toBe(3);
      expect(result.selectedCount).toBe(1);
      expect(result.sentCount).toBe(1);
      expect(result.toneDistribution).toEqual({
        professional: 1,
        casual: 1,
        curious: 1,
      });
    });
  });

  describe('getLatestVariantGroup', () => {
    it('should retrieve the most recent variant group for a contact', async () => {
      mockRepository.find.mockResolvedValue([mockSavedVariants[0]]);

      const result = await service.getLatestVariantGroup(mockAccountId, mockContactId);

      expect(result).toBeDefined();
      expect(mockRepository.find).toHaveBeenCalled();
    });

    it('should return null when no variants exist', async () => {
      mockRepository.find.mockResolvedValue([]);

      const result = await service.getLatestVariantGroup(mockAccountId, mockContactId);

      expect(result).toBeNull();
    });
  });
});
