import { MessageVariant } from './message-variant.entity';

describe('MessageVariant Entity', () => {
  let variant: MessageVariant;

  beforeEach(() => {
    variant = new MessageVariant();
    variant.id = 'variant-uuid-123';
    variant.accountId = 'account-uuid-123';
    variant.hubspotContactId = 12345;
    variant.variantGroupId = 'group-uuid-123';
    variant.variantIndex = 0;
    variant.tone = 'professional';
    variant.subject = 'Quick check-in';
    variant.body = 'Hi John, hope you are doing well...';
    variant.aiModel = 'gpt-4o';
    variant.promptTokens = 100;
    variant.completionTokens = 50;
    variant.isSelected = false;
    variant.isSent = false;
    variant.createdAt = new Date();
  });

  describe('getTotalTokens', () => {
    it('should return sum of prompt and completion tokens', () => {
      expect(variant.getTotalTokens()).toBe(150);
    });

    it('should handle undefined tokens', () => {
      variant.promptTokens = undefined;
      variant.completionTokens = undefined;
      expect(variant.getTotalTokens()).toBe(0);
    });

    it('should handle partial undefined tokens', () => {
      variant.promptTokens = undefined;
      variant.completionTokens = 50;
      expect(variant.getTotalTokens()).toBe(50);
    });
  });

  describe('wasUsed', () => {
    it('should return false when not selected and not sent', () => {
      variant.isSelected = false;
      variant.isSent = false;
      expect(variant.wasUsed()).toBe(false);
    });

    it('should return true when selected', () => {
      variant.isSelected = true;
      variant.isSent = false;
      expect(variant.wasUsed()).toBe(true);
    });

    it('should return true when sent', () => {
      variant.isSelected = false;
      variant.isSent = true;
      expect(variant.wasUsed()).toBe(true);
    });

    it('should return true when both selected and sent', () => {
      variant.isSelected = true;
      variant.isSent = true;
      expect(variant.wasUsed()).toBe(true);
    });
  });

  describe('entity properties', () => {
    it('should have all required properties', () => {
      expect(variant.id).toBeDefined();
      expect(variant.accountId).toBeDefined();
      expect(variant.hubspotContactId).toBeDefined();
      expect(variant.variantGroupId).toBeDefined();
      expect(variant.variantIndex).toBeDefined();
      expect(variant.tone).toBeDefined();
      expect(variant.subject).toBeDefined();
      expect(variant.body).toBeDefined();
    });

    it('should support context snapshot', () => {
      variant.contextSnapshot = {
        firstName: 'John',
        company: 'Acme Corp',
        industry: 'Technology',
      };
      expect(variant.contextSnapshot).toEqual({
        firstName: 'John',
        company: 'Acme Corp',
        industry: 'Technology',
      });
    });

    it('should support all tone types', () => {
      const tones: Array<'professional' | 'casual' | 'curious'> = [
        'professional',
        'casual',
        'curious',
      ];

      tones.forEach(tone => {
        variant.tone = tone;
        expect(variant.tone).toBe(tone);
      });
    });
  });

  describe('default values', () => {
    it('should default isSelected to false', () => {
      const newVariant = new MessageVariant();
      expect(newVariant.isSelected).toBe(false);
    });

    it('should default isSent to false', () => {
      const newVariant = new MessageVariant();
      expect(newVariant.isSent).toBe(false);
    });
  });
});
