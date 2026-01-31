import { Test, TestingModule } from '@nestjs/testing';
import { ContactsService, HubspotContact } from './contacts.service';
import { OAuthService } from './oauth.service';
import { Logger } from '@nestjs/common';

describe('ContactsService', () => {
  let service: ContactsService;
  let oauthService: OAuthService;

  const mockOAuthService = {
    getValidAccessToken: jest.fn(),
  };

  // Mock HubSpot client responses
  const mockContact: HubspotContact = {
    id: '123',
    properties: {
      email: 'test@example.com',
      firstname: 'John',
      lastname: 'Doe',
      company: 'Acme Inc',
      jobtitle: 'Developer',
      phone: '+1234567890',
      notes_last_contacted: '2025-01-01T00:00:00Z',
      hs_email_last_open_date: '2025-01-10T00:00:00Z',
      hs_email_last_click_date: '2025-01-08T00:00:00Z',
      hs_analytics_last_visit_timestamp: '2025-01-05T00:00:00Z',
      hs_lead_status: 'OPEN',
      lifecyclestage: 'lead',
    },
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2025-01-15T00:00:00Z',
  };

  const mockContactsPage = {
    results: [mockContact],
    paging: {
      next: {
        after: 'cursor123',
      },
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactsService,
        {
          provide: OAuthService,
          useValue: mockOAuthService,
        },
      ],
    }).compile();

    service = module.get<ContactsService>(ContactsService);
    oauthService = module.get<OAuthService>(OAuthService);

    // Suppress logger output during tests
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getContacts', () => {
    it('should fetch contacts from HubSpot', async () => {
      const portalId = 12345;
      mockOAuthService.getValidAccessToken.mockResolvedValue('test-token');

      jest.spyOn(service as any, 'fetchContactsPage').mockResolvedValue({
        contacts: [mockContact],
        nextCursor: undefined,
      });

      const result = await service.getContacts(portalId);

      expect(mockOAuthService.getValidAccessToken).toHaveBeenCalledWith(portalId);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('123');
    });

    it('should include required properties in fetch request', async () => {
      const portalId = 12345;
      mockOAuthService.getValidAccessToken.mockResolvedValue('test-token');

      const fetchSpy = jest
        .spyOn(service as any, 'fetchContactsPage')
        .mockResolvedValue({
          contacts: [],
          nextCursor: undefined,
        });

      await service.getContacts(portalId);

      expect(fetchSpy).toHaveBeenCalledWith(
        'test-token',
        expect.objectContaining({
          properties: expect.arrayContaining([
            'email',
            'firstname',
            'lastname',
            'notes_last_contacted',
            'hs_email_last_open_date',
          ]),
        }),
      );
    });

    it('should respect limit parameter', async () => {
      const portalId = 12345;
      const limit = 50;
      mockOAuthService.getValidAccessToken.mockResolvedValue('test-token');

      const contacts = Array(100)
        .fill(null)
        .map((_, i) => ({ ...mockContact, id: String(i) }));

      jest.spyOn(service as any, 'fetchContactsPage').mockResolvedValue({
        contacts: contacts.slice(0, limit),
        nextCursor: undefined,
      });

      const result = await service.getContacts(portalId, { limit });

      expect(result.length).toBeLessThanOrEqual(limit);
    });
  });

  describe('pagination', () => {
    it('should handle pagination with cursor', async () => {
      const portalId = 12345;
      mockOAuthService.getValidAccessToken.mockResolvedValue('test-token');

      const fetchSpy = jest.spyOn(service as any, 'fetchContactsPage');

      // First page
      fetchSpy.mockResolvedValueOnce({
        contacts: [{ ...mockContact, id: '1' }],
        nextCursor: 'cursor1',
      });

      // Second page
      fetchSpy.mockResolvedValueOnce({
        contacts: [{ ...mockContact, id: '2' }],
        nextCursor: undefined,
      });

      const result = await service.getContacts(portalId, { fetchAll: true });

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);
    });

    it('should stop pagination when no more results', async () => {
      const portalId = 12345;
      mockOAuthService.getValidAccessToken.mockResolvedValue('test-token');

      jest.spyOn(service as any, 'fetchContactsPage').mockResolvedValue({
        contacts: [mockContact],
        nextCursor: undefined,
      });

      const result = await service.getContacts(portalId, { fetchAll: true });

      expect(result).toHaveLength(1);
    });

    it('should use provided cursor for starting point', async () => {
      const portalId = 12345;
      const startCursor = 'start-cursor';
      mockOAuthService.getValidAccessToken.mockResolvedValue('test-token');

      const fetchSpy = jest
        .spyOn(service as any, 'fetchContactsPage')
        .mockResolvedValue({
          contacts: [mockContact],
          nextCursor: undefined,
        });

      await service.getContacts(portalId, { cursor: startCursor });

      expect(fetchSpy).toHaveBeenCalledWith(
        'test-token',
        expect.objectContaining({
          after: startCursor,
        }),
      );
    });
  });

  describe('rate limiting', () => {
    it('should handle rate limit errors with retry', async () => {
      const portalId = 12345;
      mockOAuthService.getValidAccessToken.mockResolvedValue('test-token');

      // Mock delay to avoid actual waiting
      jest.spyOn(service as any, 'delay').mockResolvedValue(undefined);

      const fetchSpy = jest.spyOn(service as any, 'fetchContactsPage');

      // First call hits rate limit
      fetchSpy.mockRejectedValueOnce({
        code: 429,
        message: 'Rate limit exceeded',
      });

      // Retry succeeds
      fetchSpy.mockResolvedValueOnce({
        contacts: [mockContact],
        nextCursor: undefined,
      });

      const result = await service.getContacts(portalId);

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(1);
    });

    it('should throw after max retries exceeded', async () => {
      const portalId = 12345;
      mockOAuthService.getValidAccessToken.mockResolvedValue('test-token');

      // Mock delay to avoid actual waiting
      jest.spyOn(service as any, 'delay').mockResolvedValue(undefined);

      jest.spyOn(service as any, 'fetchContactsPage').mockRejectedValue({
        code: 429,
        message: 'Rate limit exceeded',
      });

      await expect(service.getContacts(portalId)).rejects.toThrow(
        'Rate limit exceeded after max retries',
      );
    }, 10000);

    it('should implement exponential backoff on retries', async () => {
      const portalId = 12345;
      mockOAuthService.getValidAccessToken.mockResolvedValue('test-token');

      const delaySpy = jest
        .spyOn(service as any, 'delay')
        .mockResolvedValue(undefined);

      const fetchSpy = jest.spyOn(service as any, 'fetchContactsPage');
      fetchSpy.mockRejectedValueOnce({ code: 429 });
      fetchSpy.mockRejectedValueOnce({ code: 429 });
      fetchSpy.mockResolvedValueOnce({
        contacts: [mockContact],
        nextCursor: undefined,
      });

      await service.getContacts(portalId);

      // First retry should have shorter delay than second
      expect(delaySpy).toHaveBeenCalledTimes(2);
      const firstDelay = delaySpy.mock.calls[0][0] as number;
      const secondDelay = delaySpy.mock.calls[1][0] as number;
      expect(secondDelay).toBeGreaterThan(firstDelay);
    });
  });

  describe('getContactById', () => {
    it('should fetch a single contact by ID', async () => {
      const portalId = 12345;
      const contactId = '456';
      mockOAuthService.getValidAccessToken.mockResolvedValue('test-token');

      jest
        .spyOn(service as any, 'fetchContactById')
        .mockResolvedValue(mockContact);

      const result = await service.getContactById(portalId, contactId);

      expect(result).toEqual(mockContact);
      expect(result?.id).toBe('123');
    });

    it('should return null for non-existent contact', async () => {
      const portalId = 12345;
      const contactId = 'nonexistent';
      mockOAuthService.getValidAccessToken.mockResolvedValue('test-token');

      jest.spyOn(service as any, 'fetchContactById').mockResolvedValue(null);

      const result = await service.getContactById(portalId, contactId);

      expect(result).toBeNull();
    });
  });

  describe('searchContacts', () => {
    it('should search contacts with filters', async () => {
      const portalId = 12345;
      const filters = {
        propertyName: 'email',
        operator: 'CONTAINS',
        value: '@example.com',
      };
      mockOAuthService.getValidAccessToken.mockResolvedValue('test-token');

      jest.spyOn(service as any, 'executeSearch').mockResolvedValue({
        contacts: [mockContact],
        total: 1,
      });

      const result = await service.searchContacts(portalId, [filters]);

      expect(result.contacts).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should support multiple filter groups (AND logic)', async () => {
      const portalId = 12345;
      const filters = [
        { propertyName: 'lifecyclestage', operator: 'EQ', value: 'lead' },
        {
          propertyName: 'notes_last_contacted',
          operator: 'LT',
          value: '2025-01-01',
        },
      ];
      mockOAuthService.getValidAccessToken.mockResolvedValue('test-token');

      const searchSpy = jest
        .spyOn(service as any, 'executeSearch')
        .mockResolvedValue({
          contacts: [],
          total: 0,
        });

      await service.searchContacts(portalId, filters);

      expect(searchSpy).toHaveBeenCalledWith(
        'test-token',
        expect.objectContaining({
          filterGroups: expect.arrayContaining([
            expect.objectContaining({
              filters: expect.arrayContaining([
                expect.objectContaining({ propertyName: 'lifecyclestage' }),
                expect.objectContaining({ propertyName: 'notes_last_contacted' }),
              ]),
            }),
          ]),
        }),
      );
    });
  });

  describe('searchWithRequest', () => {
    it('should search contacts with a full search request object', async () => {
      const portalId = 12345;
      const searchRequest = {
        filterGroups: [
          {
            filters: [
              { propertyName: 'notes_last_contacted', operator: 'LT', value: '2025-01-01' },
              { propertyName: 'hs_email_last_open_date', operator: 'LT', value: '2025-01-15' },
            ],
          },
        ],
        properties: ['email', 'firstname', 'lastname'],
        limit: 50,
      };
      mockOAuthService.getValidAccessToken.mockResolvedValue('test-token');

      const searchSpy = jest.spyOn(service as any, 'executeSearch').mockResolvedValue({
        contacts: [mockContact],
        total: 1,
      });

      const result = await service.searchWithRequest(portalId, searchRequest);

      expect(result.contacts).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(searchSpy).toHaveBeenCalledWith('test-token', searchRequest);
    });

    it('should pass through pagination cursor', async () => {
      const portalId = 12345;
      const searchRequest = {
        filterGroups: [{ filters: [] }],
        properties: ['email'],
        limit: 100,
        after: 'cursor-123',
      };
      mockOAuthService.getValidAccessToken.mockResolvedValue('test-token');

      const searchSpy = jest.spyOn(service as any, 'executeSearch').mockResolvedValue({
        contacts: [],
        total: 0,
      });

      await service.searchWithRequest(portalId, searchRequest);

      expect(searchSpy).toHaveBeenCalledWith(
        'test-token',
        expect.objectContaining({ after: 'cursor-123' }),
      );
    });
  });

  describe('getDormantContacts', () => {
    it('should find contacts inactive for specified days', async () => {
      const portalId = 12345;
      const daysInactive = 30;
      mockOAuthService.getValidAccessToken.mockResolvedValue('test-token');

      jest.spyOn(service as any, 'executeSearch').mockResolvedValue({
        contacts: [mockContact],
        total: 1,
      });

      const result = await service.getDormantContacts(portalId, daysInactive);

      expect(result).toHaveLength(1);
    });

    it('should filter by last contact date', async () => {
      const portalId = 12345;
      const daysInactive = 30;
      mockOAuthService.getValidAccessToken.mockResolvedValue('test-token');

      const searchSpy = jest
        .spyOn(service as any, 'executeSearch')
        .mockResolvedValue({
          contacts: [],
          total: 0,
        });

      await service.getDormantContacts(portalId, daysInactive);

      expect(searchSpy).toHaveBeenCalledWith(
        'test-token',
        expect.objectContaining({
          filterGroups: expect.arrayContaining([
            expect.objectContaining({
              filters: expect.arrayContaining([
                expect.objectContaining({
                  propertyName: 'notes_last_contacted',
                  operator: 'LT',
                }),
              ]),
            }),
          ]),
        }),
      );
    });

    it('should exclude contacts with recent email opens', async () => {
      const portalId = 12345;
      const daysInactive = 30;
      const excludeRecentOpens = true;
      mockOAuthService.getValidAccessToken.mockResolvedValue('test-token');

      const searchSpy = jest
        .spyOn(service as any, 'executeSearch')
        .mockResolvedValue({
          contacts: [],
          total: 0,
        });

      await service.getDormantContacts(portalId, daysInactive, {
        excludeRecentEmailOpens: excludeRecentOpens,
        emailOpenDays: 14,
      });

      expect(searchSpy).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should throw when access token cannot be obtained', async () => {
      const portalId = 12345;
      mockOAuthService.getValidAccessToken.mockRejectedValue(
        new Error('Account not found'),
      );

      await expect(service.getContacts(portalId)).rejects.toThrow(
        'Account not found',
      );
    });

    it('should handle HubSpot API errors gracefully', async () => {
      const portalId = 12345;
      mockOAuthService.getValidAccessToken.mockResolvedValue('test-token');

      const serverError = new Error('Internal server error');
      (serverError as any).code = 500;

      jest.spyOn(service as any, 'fetchContactsPage').mockRejectedValue(serverError);

      await expect(service.getContacts(portalId)).rejects.toThrow('Internal server error');
    });

    it('should handle invalid portal ID', async () => {
      const invalidPortalId = -1;

      await expect(service.getContacts(invalidPortalId)).rejects.toThrow();
    });
  });
});
