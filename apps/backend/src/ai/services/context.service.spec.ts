import { Test, TestingModule } from '@nestjs/testing';
import { ContextService, ContactContext } from './context.service';
import { ContactsService } from '../../hubspot/services/contacts.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';

describe('ContextService', () => {
  let service: ContextService;
  let contactsService: jest.Mocked<ContactsService>;
  let cacheManager: jest.Mocked<any>;

  const mockContact = {
    id: '12345',
    properties: {
      email: 'john.doe@acmecorp.com',
      firstname: 'John',
      lastname: 'Doe',
      company: 'Acme Corp',
      jobtitle: 'VP of Sales',
      industry: 'Technology',
      hubspotscore: '85',
      notes_last_contacted: '2024-10-15T10:00:00Z',
      hs_email_last_open_date: '2024-10-10T08:30:00Z',
      hs_email_last_click_date: '2024-10-08T14:20:00Z',
      hs_analytics_last_visit_timestamp: '2024-10-05T09:00:00Z',
      num_contacted_notes: '12',
      annualrevenue: '5000000',
      numberofemployees: '250',
    },
    createdAt: '2024-01-15T00:00:00Z',
    updatedAt: '2024-10-15T10:00:00Z',
  };

  const mockDeal = {
    id: 'deal-123',
    properties: {
      dealname: 'Enterprise License Deal',
      dealstage: 'qualifiedtobuy',
      amount: '75000',
      closedate: '2025-03-15',
      pipeline: 'default',
    },
  };

  const mockEmailHistory = [
    {
      id: 'email-1',
      properties: {
        hs_email_subject: 'Follow up on our demo',
        hs_timestamp: '2024-10-10T10:00:00Z',
      },
    },
    {
      id: 'email-2',
      properties: {
        hs_email_subject: 'Q4 Planning Discussion',
        hs_timestamp: '2024-09-20T14:00:00Z',
      },
    },
  ];

  const mockContactsService = {
    getContact: jest.fn(),
    getContactDeals: jest.fn(),
    getContactEmails: jest.fn(),
    getContactCompany: jest.fn(),
  };

  const mockCacheManager = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContextService,
        { provide: ContactsService, useValue: mockContactsService },
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
      ],
    }).compile();

    service = module.get<ContextService>(ContextService);
    contactsService = module.get(ContactsService);
    cacheManager = module.get(CACHE_MANAGER);

    jest.clearAllMocks();
  });

  describe('getContactContext', () => {
    it('should build complete contact context', async () => {
      mockContactsService.getContact.mockResolvedValue(mockContact);
      mockContactsService.getContactDeals.mockResolvedValue([mockDeal]);
      mockContactsService.getContactEmails.mockResolvedValue(mockEmailHistory);
      mockCacheManager.get.mockResolvedValue(null);

      const context = await service.getContactContext('account-123', 123456, '12345');

      expect(context.firstName).toBe('John');
      expect(context.lastName).toBe('Doe');
      expect(context.company).toBe('Acme Corp');
      expect(context.jobTitle).toBe('VP of Sales');
      expect(context.industry).toBe('Technology');
      expect(context.leadScore).toBe(85);
    });

    it('should calculate days since last contact', async () => {
      const recentContact = {
        ...mockContact,
        properties: {
          ...mockContact.properties,
          notes_last_contacted: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
      };

      mockContactsService.getContact.mockResolvedValue(recentContact);
      mockContactsService.getContactDeals.mockResolvedValue([]);
      mockContactsService.getContactEmails.mockResolvedValue([]);
      mockCacheManager.get.mockResolvedValue(null);

      const context = await service.getContactContext('account-123', 123456, '12345');

      expect(context.daysSinceContact).toBeGreaterThanOrEqual(29);
      expect(context.daysSinceContact).toBeLessThanOrEqual(31);
    });

    it('should include deal information when available', async () => {
      mockContactsService.getContact.mockResolvedValue(mockContact);
      mockContactsService.getContactDeals.mockResolvedValue([mockDeal]);
      mockContactsService.getContactEmails.mockResolvedValue([]);
      mockCacheManager.get.mockResolvedValue(null);

      const context = await service.getContactContext('account-123', 123456, '12345');

      expect(context.dealName).toBe('Enterprise License Deal');
      expect(context.dealStage).toBe('qualifiedtobuy');
      expect(context.dealAmount).toBe(75000);
    });

    it('should handle contacts without deals', async () => {
      mockContactsService.getContact.mockResolvedValue(mockContact);
      mockContactsService.getContactDeals.mockResolvedValue([]);
      mockContactsService.getContactEmails.mockResolvedValue([]);
      mockCacheManager.get.mockResolvedValue(null);

      const context = await service.getContactContext('account-123', 123456, '12345');

      expect(context.dealName).toBeUndefined();
      expect(context.dealStage).toBeUndefined();
      expect(context.dealAmount).toBeUndefined();
    });

    it('should include email history', async () => {
      mockContactsService.getContact.mockResolvedValue(mockContact);
      mockContactsService.getContactDeals.mockResolvedValue([]);
      mockContactsService.getContactEmails.mockResolvedValue(mockEmailHistory);
      mockCacheManager.get.mockResolvedValue(null);

      const context = await service.getContactContext('account-123', 123456, '12345');

      expect(context.emailHistory).toHaveLength(2);
      expect(context.emailHistory[0].subject).toBe('Follow up on our demo');
    });

    it('should limit email history to most recent entries', async () => {
      const manyEmails = Array(20).fill(null).map((_, i) => ({
        id: `email-${i}`,
        properties: {
          hs_email_subject: `Email ${i}`,
          hs_timestamp: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
        },
      }));

      mockContactsService.getContact.mockResolvedValue(mockContact);
      mockContactsService.getContactDeals.mockResolvedValue([]);
      mockContactsService.getContactEmails.mockResolvedValue(manyEmails);
      mockCacheManager.get.mockResolvedValue(null);

      const context = await service.getContactContext('account-123', 123456, '12345');

      expect(context.emailHistory.length).toBeLessThanOrEqual(10);
    });

    it('should extract previous interests from email subjects', async () => {
      const emailsWithTopics = [
        { id: '1', properties: { hs_email_subject: 'Discussion about CRM integration', hs_timestamp: '2024-10-10T10:00:00Z' } },
        { id: '2', properties: { hs_email_subject: 'API pricing question', hs_timestamp: '2024-10-05T10:00:00Z' } },
        { id: '3', properties: { hs_email_subject: 'Enterprise features demo', hs_timestamp: '2024-09-20T10:00:00Z' } },
      ];

      mockContactsService.getContact.mockResolvedValue(mockContact);
      mockContactsService.getContactDeals.mockResolvedValue([]);
      mockContactsService.getContactEmails.mockResolvedValue(emailsWithTopics);
      mockCacheManager.get.mockResolvedValue(null);

      const context = await service.getContactContext('account-123', 123456, '12345');

      expect(context.previousInterests).toBeDefined();
      expect(context.previousInterests.length).toBeGreaterThan(0);
    });
  });

  describe('caching', () => {
    it('should return cached context if available', async () => {
      const cachedContext: ContactContext = {
        contactId: '12345',
        firstName: 'John',
        lastName: 'Doe',
        company: 'Acme Corp',
        jobTitle: 'VP of Sales',
        industry: 'Technology',
        lastContactDate: new Date('2024-10-15'),
        daysSinceContact: 30,
        leadScore: 85,
        emailHistory: [],
        previousInterests: [],
      };

      mockCacheManager.get.mockResolvedValue(cachedContext);

      const context = await service.getContactContext('account-123', 123456, '12345');

      expect(context).toEqual(cachedContext);
      expect(mockContactsService.getContact).not.toHaveBeenCalled();
    });

    it('should cache context after fetching', async () => {
      mockContactsService.getContact.mockResolvedValue(mockContact);
      mockContactsService.getContactDeals.mockResolvedValue([]);
      mockContactsService.getContactEmails.mockResolvedValue([]);
      mockCacheManager.get.mockResolvedValue(null);

      await service.getContactContext('account-123', 123456, '12345');

      expect(mockCacheManager.set).toHaveBeenCalledWith(
        expect.stringContaining('contact-context:'),
        expect.any(Object),
        expect.any(Number),
      );
    });

    it('should skip cache when forceRefresh is true', async () => {
      const cachedContext: ContactContext = {
        contactId: '12345',
        firstName: 'Cached',
        lastName: 'User',
        company: 'Old Company',
        jobTitle: 'Old Title',
        industry: 'Old Industry',
        lastContactDate: new Date('2024-01-01'),
        daysSinceContact: 100,
        leadScore: 50,
        emailHistory: [],
        previousInterests: [],
      };

      mockCacheManager.get.mockResolvedValue(cachedContext);
      mockContactsService.getContact.mockResolvedValue(mockContact);
      mockContactsService.getContactDeals.mockResolvedValue([]);
      mockContactsService.getContactEmails.mockResolvedValue([]);

      const context = await service.getContactContext('account-123', 123456, '12345', true);

      expect(mockContactsService.getContact).toHaveBeenCalled();
      expect(context.firstName).toBe('John');
    });

    it('should invalidate cache for a contact', async () => {
      await service.invalidateCache('account-123', '12345');

      expect(mockCacheManager.del).toHaveBeenCalledWith(
        expect.stringContaining('contact-context:account-123:12345'),
      );
    });
  });

  describe('edge cases', () => {
    it('should handle missing contact properties gracefully', async () => {
      const minimalContact = {
        id: '12345',
        properties: {
          email: 'test@example.com',
        },
        createdAt: '2024-01-15T00:00:00Z',
        updatedAt: '2024-10-15T10:00:00Z',
      };

      mockContactsService.getContact.mockResolvedValue(minimalContact);
      mockContactsService.getContactDeals.mockResolvedValue([]);
      mockContactsService.getContactEmails.mockResolvedValue([]);
      mockCacheManager.get.mockResolvedValue(null);

      const context = await service.getContactContext('account-123', 123456, '12345');

      expect(context.contactId).toBe('12345');
      expect(context.firstName).toBeUndefined();
      expect(context.lastName).toBeUndefined();
      expect(context.company).toBeUndefined();
    });

    it('should handle null lastContactDate', async () => {
      const contactWithoutLastContact = {
        ...mockContact,
        properties: {
          ...mockContact.properties,
          notes_last_contacted: null,
        },
      };

      mockContactsService.getContact.mockResolvedValue(contactWithoutLastContact);
      mockContactsService.getContactDeals.mockResolvedValue([]);
      mockContactsService.getContactEmails.mockResolvedValue([]);
      mockCacheManager.get.mockResolvedValue(null);

      const context = await service.getContactContext('account-123', 123456, '12345');

      expect(context.lastContactDate).toBeUndefined();
      expect(context.daysSinceContact).toBeUndefined();
    });

    it('should handle invalid lead score values', async () => {
      const contactWithInvalidScore = {
        ...mockContact,
        properties: {
          ...mockContact.properties,
          hubspotscore: 'invalid',
        },
      };

      mockContactsService.getContact.mockResolvedValue(contactWithInvalidScore);
      mockContactsService.getContactDeals.mockResolvedValue([]);
      mockContactsService.getContactEmails.mockResolvedValue([]);
      mockCacheManager.get.mockResolvedValue(null);

      const context = await service.getContactContext('account-123', 123456, '12345');

      expect(context.leadScore).toBeUndefined();
    });

    it('should throw error when contact not found', async () => {
      mockContactsService.getContact.mockResolvedValue(null);
      mockCacheManager.get.mockResolvedValue(null);

      await expect(
        service.getContactContext('account-123', 123456, 'nonexistent'),
      ).rejects.toThrow('Contact not found');
    });
  });

  describe('buildContextForPrompt', () => {
    it('should format context as a readable string for AI', async () => {
      mockContactsService.getContact.mockResolvedValue(mockContact);
      mockContactsService.getContactDeals.mockResolvedValue([mockDeal]);
      mockContactsService.getContactEmails.mockResolvedValue(mockEmailHistory);
      mockCacheManager.get.mockResolvedValue(null);

      const context = await service.getContactContext('account-123', 123456, '12345');
      const promptContext = service.buildContextForPrompt(context);

      expect(promptContext).toContain('John Doe');
      expect(promptContext).toContain('Acme Corp');
      expect(promptContext).toContain('VP of Sales');
      expect(promptContext).toContain('Enterprise License Deal');
    });

    it('should omit missing fields from prompt context', async () => {
      const minimalContext: ContactContext = {
        contactId: '12345',
        firstName: 'John',
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

      const promptContext = service.buildContextForPrompt(minimalContext);

      expect(promptContext).toContain('John');
      expect(promptContext).not.toContain('undefined');
      expect(promptContext).not.toContain('Company:');
    });
  });

  describe('getMultipleContactContexts', () => {
    it('should fetch contexts for multiple contacts', async () => {
      mockContactsService.getContact.mockResolvedValue(mockContact);
      mockContactsService.getContactDeals.mockResolvedValue([]);
      mockContactsService.getContactEmails.mockResolvedValue([]);
      mockCacheManager.get.mockResolvedValue(null);

      const contactIds = ['12345', '12346', '12347'];
      const contexts = await service.getMultipleContactContexts(
        'account-123',
        123456,
        contactIds,
      );

      expect(contexts).toHaveLength(3);
      expect(mockContactsService.getContact).toHaveBeenCalledTimes(3);
    });

    it('should handle partial failures gracefully', async () => {
      mockContactsService.getContact
        .mockResolvedValueOnce(mockContact)
        .mockResolvedValueOnce(null) // Will throw
        .mockResolvedValueOnce(mockContact);
      mockContactsService.getContactDeals.mockResolvedValue([]);
      mockContactsService.getContactEmails.mockResolvedValue([]);
      mockCacheManager.get.mockResolvedValue(null);

      const contactIds = ['12345', '12346', '12347'];
      const contexts = await service.getMultipleContactContexts(
        'account-123',
        123456,
        contactIds,
      );

      // Should return successful contexts only
      expect(contexts.length).toBe(2);
    });
  });
});
