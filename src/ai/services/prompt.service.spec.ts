import { Test, TestingModule } from '@nestjs/testing';
import { PromptService, PromptOptions, MessageTone } from './prompt.service';
import { ContactContext } from './context.service';

describe('PromptService', () => {
  let service: PromptService;

  const mockContext: ContactContext = {
    contactId: '12345',
    firstName: 'John',
    lastName: 'Doe',
    company: 'Acme Corp',
    jobTitle: 'VP of Sales',
    industry: 'Technology',
    lastContactDate: new Date('2024-10-15'),
    daysSinceContact: 100,
    leadScore: 85,
    dealName: 'Enterprise License',
    dealStage: 'qualifiedtobuy',
    dealAmount: 75000,
    emailHistory: [
      { subject: 'Follow up on our demo', date: new Date('2024-10-10') },
      { subject: 'Q4 Planning Discussion', date: new Date('2024-09-20') },
    ],
    previousInterests: ['demo', 'enterprise', 'pricing'],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PromptService],
    }).compile();

    service = module.get<PromptService>(PromptService);
  });

  describe('getSystemPrompt', () => {
    it('should return a system prompt for reactivation emails', () => {
      const prompt = service.getSystemPrompt('reactivation');

      expect(prompt).toContain('B2B sales');
      expect(prompt).toContain('reactivation');
      expect(prompt).toContain('short');
    });

    it('should include tone guidelines', () => {
      const prompt = service.getSystemPrompt('reactivation');

      expect(prompt).toContain('pushy');
      expect(prompt).toContain('human');
    });

    it('should return different prompts for different templates', () => {
      const reactivationPrompt = service.getSystemPrompt('reactivation');
      const followUpPrompt = service.getSystemPrompt('follow-up');

      expect(reactivationPrompt).not.toBe(followUpPrompt);
    });
  });

  describe('buildUserPrompt', () => {
    it('should include contact information', () => {
      const prompt = service.buildUserPrompt(mockContext);

      expect(prompt).toContain('John');
      expect(prompt).toContain('Doe');
      expect(prompt).toContain('Acme Corp');
      expect(prompt).toContain('VP of Sales');
    });

    it('should include days since contact', () => {
      const prompt = service.buildUserPrompt(mockContext);

      expect(prompt).toContain('100');
    });

    it('should include deal information when available', () => {
      const prompt = service.buildUserPrompt(mockContext);

      expect(prompt).toContain('Enterprise License');
      expect(prompt).toContain('qualifiedtobuy');
    });

    it('should include email history subjects', () => {
      const prompt = service.buildUserPrompt(mockContext);

      expect(prompt).toContain('Follow up on our demo');
      expect(prompt).toContain('Q4 Planning Discussion');
    });

    it('should include previous interests', () => {
      const prompt = service.buildUserPrompt(mockContext);

      expect(prompt).toContain('demo');
      expect(prompt).toContain('enterprise');
      expect(prompt).toContain('pricing');
    });

    it('should handle missing optional fields', () => {
      const minimalContext: ContactContext = {
        contactId: '12345',
        firstName: 'Jane',
        lastName: undefined,
        company: undefined,
        jobTitle: undefined,
        industry: undefined,
        lastContactDate: undefined,
        daysSinceContact: undefined,
        leadScore: undefined,
        emailHistory: [],
        previousInterests: [],
      };

      const prompt = service.buildUserPrompt(minimalContext);

      expect(prompt).toContain('Jane');
      expect(prompt).not.toContain('undefined');
    });
  });

  describe('buildPromptWithTone', () => {
    it('should add casual tone instructions', () => {
      const prompt = service.buildPromptWithTone(mockContext, { tone: 'casual' });

      expect(prompt.toLowerCase()).toContain('casual');
      expect(prompt.toLowerCase()).toContain('friendly');
    });

    it('should add professional tone instructions', () => {
      const prompt = service.buildPromptWithTone(mockContext, { tone: 'professional' });

      expect(prompt.toLowerCase()).toContain('professional');
      expect(prompt.toLowerCase()).toContain('formal');
    });

    it('should add curious tone instructions', () => {
      const prompt = service.buildPromptWithTone(mockContext, { tone: 'curious' });

      expect(prompt.toLowerCase()).toContain('curious');
      expect(prompt.toLowerCase()).toContain('question');
    });

    it('should default to professional tone', () => {
      const prompt = service.buildPromptWithTone(mockContext, {});

      expect(prompt.toLowerCase()).toContain('professional');
    });
  });

  describe('buildVariantPrompts', () => {
    it('should generate prompts for multiple tones', () => {
      const prompts = service.buildVariantPrompts(mockContext, 3);

      expect(prompts).toHaveLength(3);
      expect(prompts[0].tone).toBe('professional');
      expect(prompts[1].tone).toBe('casual');
      expect(prompts[2].tone).toBe('curious');
    });

    it('should limit variants to available tones', () => {
      const prompts = service.buildVariantPrompts(mockContext, 10);

      expect(prompts.length).toBeLessThanOrEqual(3);
    });

    it('should include contact context in all variants', () => {
      const prompts = service.buildVariantPrompts(mockContext, 2);

      for (const prompt of prompts) {
        expect(prompt.userPrompt).toContain('John');
        expect(prompt.userPrompt).toContain('Acme Corp');
      }
    });
  });

  describe('buildClassificationPrompt', () => {
    it('should create a prompt for classifying email responses', () => {
      const emailContent = 'Thanks for reaching out! I would love to schedule a call next week.';
      const prompt = service.buildClassificationPrompt(emailContent);

      expect(prompt).toContain('Classify');
      expect(prompt).toContain('INTERESTED');
      expect(prompt).toContain('NOT_NOW');
      expect(prompt).toContain('NOT_INTERESTED');
      expect(prompt).toContain('UNSUBSCRIBE');
      expect(prompt).toContain(emailContent);
    });

    it('should request JSON output format', () => {
      const prompt = service.buildClassificationPrompt('Test email');

      expect(prompt).toContain('JSON');
      expect(prompt).toContain('classification');
      expect(prompt).toContain('confidence');
    });
  });

  describe('getOutputFormatInstructions', () => {
    it('should return email generation format instructions', () => {
      const instructions = service.getOutputFormatInstructions('email');

      expect(instructions).toContain('subject');
      expect(instructions).toContain('body');
      expect(instructions).toContain('JSON');
    });

    it('should return SMS generation format instructions', () => {
      const instructions = service.getOutputFormatInstructions('sms');

      expect(instructions).toContain('message');
      expect(instructions).toContain('160');
    });
  });

  describe('validatePromptLength', () => {
    it('should return true for prompts within limit', () => {
      const shortPrompt = 'This is a short prompt';
      const result = service.validatePromptLength(shortPrompt);

      expect(result.valid).toBe(true);
    });

    it('should return false for prompts exceeding limit', () => {
      const longPrompt = 'a'.repeat(50000);
      const result = service.validatePromptLength(longPrompt);

      expect(result.valid).toBe(false);
      expect(result.estimatedTokens).toBeGreaterThan(0);
    });

    it('should estimate token count', () => {
      const prompt = 'This is a test prompt with several words.';
      const result = service.validatePromptLength(prompt);

      expect(result.estimatedTokens).toBeGreaterThan(0);
      expect(result.estimatedTokens).toBeLessThan(prompt.length);
    });
  });

  describe('truncateContext', () => {
    it('should truncate email history if too long', () => {
      const contextWithManyEmails: ContactContext = {
        ...mockContext,
        emailHistory: Array(50).fill(null).map((_, i) => ({
          subject: `Email subject ${i} with some additional text to make it longer`,
          date: new Date(),
        })),
      };

      const truncated = service.truncateContext(contextWithManyEmails, 1000);

      expect(truncated.emailHistory.length).toBeLessThan(50);
    });

    it('should preserve essential fields', () => {
      const truncated = service.truncateContext(mockContext, 500);

      expect(truncated.firstName).toBe(mockContext.firstName);
      expect(truncated.lastName).toBe(mockContext.lastName);
      expect(truncated.company).toBe(mockContext.company);
    });
  });
});
