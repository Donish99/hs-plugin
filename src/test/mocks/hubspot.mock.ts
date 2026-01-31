/**
 * Mock implementation for HubSpot API client
 * Used in unit and integration tests
 */

export interface MockContact {
  id: string;
  properties: {
    email: string;
    firstname: string;
    lastname: string;
    company?: string;
    notes_last_contacted?: string;
    hs_email_last_open_date?: string;
  };
}

export interface MockOAuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export const createMockHubspotClient = () => ({
  oauth: {
    tokensApi: {
      create: jest.fn(),
    },
    accessTokensApi: {
      get: jest.fn(),
    },
    refreshTokensApi: {
      archive: jest.fn(),
    },
  },
  crm: {
    contacts: {
      basicApi: {
        getById: jest.fn(),
        getPage: jest.fn(),
      },
      searchApi: {
        doSearch: jest.fn(),
      },
    },
    deals: {
      basicApi: {
        getById: jest.fn(),
      },
      searchApi: {
        doSearch: jest.fn(),
      },
    },
    objects: {
      emails: {
        basicApi: {
          create: jest.fn(),
        },
      },
    },
  },
  automation: {
    sequences: {
      enrollmentsApi: {
        create: jest.fn(),
      },
    },
  },
});

export const mockOAuthTokensResponse: MockOAuthTokens = {
  access_token: 'mock-access-token-12345',
  refresh_token: 'mock-refresh-token-67890',
  expires_in: 21600,
  token_type: 'Bearer',
};

export const mockContactsList: MockContact[] = [
  {
    id: '1',
    properties: {
      email: 'john@example.com',
      firstname: 'John',
      lastname: 'Doe',
      company: 'Acme Corp',
      notes_last_contacted: '2024-01-01T00:00:00Z',
    },
  },
  {
    id: '2',
    properties: {
      email: 'jane@example.com',
      firstname: 'Jane',
      lastname: 'Smith',
      company: 'Tech Inc',
      notes_last_contacted: '2024-01-15T00:00:00Z',
    },
  },
];

export const mockPortalInfo = {
  portalId: 12345678,
  hubId: 12345678,
  companyName: 'Test Company',
  timezone: 'America/New_York',
};
