# Complete HubSpot Testing Tutorial

A comprehensive guide for testing HubSpot integrations in the Dormant Lead Reactivation Plugin.

---

## Table of Contents

1. [Set Up HubSpot Developer Test Account](#1-set-up-hubspot-developer-test-account)
2. [Configure Your App in HubSpot](#2-configure-your-app-in-hubspot)
3. [Create Test Data in HubSpot](#3-create-test-data-in-hubspot)
4. [Testing OAuth Flow](#4-testing-oauth-flow)
5. [Testing HubSpot API Calls](#5-testing-hubspot-api-calls)
6. [Testing Dormancy Detection](#6-testing-dormancy-detection)
7. [Integration Tests with Real HubSpot API](#7-integration-tests-with-real-hubspot-api)
8. [Testing Webhooks](#8-testing-webhooks)
9. [Testing AI Message Generation](#9-testing-ai-message-generation)
10. [End-to-End Test Flow](#10-end-to-end-test-flow)
11. [Running Tests](#11-running-tests)

---

## 1. Set Up HubSpot Developer Test Account

### Create a Developer Account

1. Go to https://developers.hubspot.com/
2. Click "Create a developer account"
3. Sign up with your email
4. This gives you access to:
   - App creation dashboard
   - Test portals (sandbox accounts)
   - API documentation

### Create a Test Portal (Sandbox)

```
Developer Account → Test accounts → Create app test account
```

This creates a **free sandbox HubSpot account** with:
- Sample contacts, companies, deals
- Full API access
- No production data risk

---

## 2. Configure Your App in HubSpot

### Register Your App

1. Go to **Apps** in your developer account
2. Click **Create app**
3. Fill in:
   - App name: "Dormant Lead Reactivation (Dev)"
   - Description: Your app description
   - Logo (optional)

### Set Up OAuth

In your app settings, configure:

```
Auth tab → Configure OAuth

Redirect URLs:
- http://localhost:3000/hubspot/oauth/callback  (development)
- https://yourdomain.com/hubspot/oauth/callback (production)

Required Scopes:
- crm.objects.contacts.read
- crm.objects.contacts.write
- crm.objects.companies.read
- crm.objects.deals.read
- timeline
- automation
```

### Get Your Credentials

```
App ID: Found in app URL (e.g., /apps/123456)
Client ID: Auth tab → Client ID
Client Secret: Auth tab → Client secret
```

Add these to your `apps/backend/.env`:

```env
HUBSPOT_CLIENT_ID=your-client-id
HUBSPOT_CLIENT_SECRET=your-client-secret
HUBSPOT_APP_ID=your-app-id
HUBSPOT_REDIRECT_URI=http://localhost:3000/hubspot/oauth/callback
```

---

## 3. Create Test Data in HubSpot

### Manual Test Contacts

In your test portal, create contacts with varying "dormancy" characteristics:

| Contact Name | Email | Last Activity | Use Case |
|-------------|-------|---------------|----------|
| Active User | active@test.com | Today | Should NOT be flagged |
| Dormant 30d | dormant30@test.com | 30 days ago | Edge case |
| Dormant 60d | dormant60@test.com | 60 days ago | Should be flagged |
| Dormant 90d | dormant90@test.com | 90 days ago | Definitely dormant |
| No Activity | noactivity@test.com | Never | Handle null case |

### Using HubSpot API to Create Test Data

Create a script `scripts/seed-test-data.ts`:

```typescript
import { Client } from '@hubspot/api-client';

const hubspotClient = new Client({ accessToken: 'your-test-access-token' });

async function seedTestContacts() {
  const testContacts = [
    {
      properties: {
        email: 'dormant90@test.com',
        firstname: 'Dormant',
        lastname: 'Ninety Days',
        hs_lead_status: 'OPEN',
        notes_last_updated: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
      },
    },
    {
      properties: {
        email: 'active@test.com',
        firstname: 'Active',
        lastname: 'User',
        hs_lead_status: 'OPEN',
        notes_last_updated: new Date().toISOString(),
      },
    },
    // Add more test contacts...
  ];

  for (const contact of testContacts) {
    try {
      const response = await hubspotClient.crm.contacts.basicApi.create(contact);
      console.log(`Created contact: ${response.properties.email}`);
    } catch (error) {
      console.error(`Failed to create contact:`, error);
    }
  }
}

seedTestContacts();
```

Run with:

```bash
npx ts-node scripts/seed-test-data.ts
```

---

## 4. Testing OAuth Flow

### Manual OAuth Test

1. Start your backend:
   ```bash
   cd apps/backend && pnpm start:dev
   ```

2. Start your frontend:
   ```bash
   cd apps/frontend && pnpm dev
   ```

3. Navigate to: `http://localhost:5173`

4. Click "Connect HubSpot" - this should redirect to:
   ```
   https://app.hubspot.com/oauth/authorize?
     client_id=YOUR_CLIENT_ID&
     redirect_uri=http://localhost:3000/hubspot/oauth/callback&
     scope=crm.objects.contacts.read%20crm.objects.contacts.write&
     state=random-state-string
   ```

5. Authorize the app in HubSpot

6. You'll be redirected back to your callback URL with a `code` parameter

7. Your backend exchanges this code for access/refresh tokens

### Automated OAuth Tests

Create `apps/backend/src/hubspot/services/oauth.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { OAuthService } from './oauth.service';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { HubspotAccount } from '../../entities/hubspot-account.entity';
import { getRepositoryToken } from '@nestjs/typeorm';
import { of } from 'rxjs';

describe('OAuthService', () => {
  let service: OAuthService;
  let httpService: HttpService;
  let repository: Repository<HubspotAccount>;

  const mockHttpService = {
    post: jest.fn(),
    get: jest.fn(),
  };

  const mockRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config = {
        HUBSPOT_CLIENT_ID: 'test-client-id',
        HUBSPOT_CLIENT_SECRET: 'test-client-secret',
        HUBSPOT_REDIRECT_URI: 'http://localhost:3000/hubspot/oauth/callback',
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OAuthService,
        { provide: HttpService, useValue: mockHttpService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: getRepositoryToken(HubspotAccount), useValue: mockRepository },
      ],
    }).compile();

    service = module.get<OAuthService>(OAuthService);
    httpService = module.get<HttpService>(HttpService);
    repository = module.get<Repository<HubspotAccount>>(getRepositoryToken(HubspotAccount));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getAuthorizationUrl', () => {
    it('should generate correct authorization URL', () => {
      const url = service.getAuthorizationUrl('test-state');

      expect(url).toContain('https://app.hubspot.com/oauth/authorize');
      expect(url).toContain('client_id=test-client-id');
      expect(url).toContain('redirect_uri=');
      expect(url).toContain('state=test-state');
    });
  });

  describe('exchangeCodeForTokens', () => {
    it('should exchange authorization code for tokens', async () => {
      const mockTokenResponse = {
        data: {
          access_token: 'test-access-token',
          refresh_token: 'test-refresh-token',
          expires_in: 21600,
        },
      };

      mockHttpService.post.mockReturnValue(of(mockTokenResponse));

      const result = await service.exchangeCodeForTokens('auth-code');

      expect(result.access_token).toBe('test-access-token');
      expect(result.refresh_token).toBe('test-refresh-token');
    });

    it('should throw error on invalid code', async () => {
      mockHttpService.post.mockReturnValue(
        of({ data: { error: 'invalid_grant' } })
      );

      await expect(service.exchangeCodeForTokens('invalid-code'))
        .rejects.toThrow();
    });
  });

  describe('refreshAccessToken', () => {
    it('should refresh expired access token', async () => {
      const mockRefreshResponse = {
        data: {
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 21600,
        },
      };

      mockHttpService.post.mockReturnValue(of(mockRefreshResponse));

      const result = await service.refreshAccessToken('old-refresh-token');

      expect(result.access_token).toBe('new-access-token');
    });
  });
});
```

---

## 5. Testing HubSpot API Calls

### Mock HubSpot Client for Unit Tests

Create `apps/backend/src/test/mocks/hubspot-client.mock.ts`:

```typescript
export const createMockHubSpotClient = () => ({
  crm: {
    contacts: {
      basicApi: {
        getById: jest.fn(),
        getPage: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        archive: jest.fn(),
      },
      searchApi: {
        doSearch: jest.fn(),
      },
    },
    companies: {
      basicApi: {
        getById: jest.fn(),
        getPage: jest.fn(),
      },
    },
    deals: {
      basicApi: {
        getById: jest.fn(),
        getPage: jest.fn(),
      },
    },
  },
  oauth: {
    tokensApi: {
      create: jest.fn(),
    },
  },
});

// Sample test data
export const mockContacts = {
  dormant: {
    id: '123',
    properties: {
      email: 'dormant@test.com',
      firstname: 'Dormant',
      lastname: 'Lead',
      hs_lead_status: 'OPEN',
      notes_last_updated: '2025-10-01T00:00:00Z', // 90+ days ago
      lastmodifieddate: '2025-10-01T00:00:00Z',
    },
  },
  active: {
    id: '456',
    properties: {
      email: 'active@test.com',
      firstname: 'Active',
      lastname: 'User',
      hs_lead_status: 'OPEN',
      notes_last_updated: new Date().toISOString(),
      lastmodifieddate: new Date().toISOString(),
    },
  },
};
```

### Contacts Service Test

Create `apps/backend/src/hubspot/services/contacts.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ContactsService } from './contacts.service';
import { createMockHubSpotClient, mockContacts } from '../../test/mocks/hubspot-client.mock';

describe('ContactsService', () => {
  let service: ContactsService;
  let mockClient: ReturnType<typeof createMockHubSpotClient>;

  beforeEach(async () => {
    mockClient = createMockHubSpotClient();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactsService,
        { provide: 'HUBSPOT_CLIENT', useValue: mockClient },
      ],
    }).compile();

    service = module.get<ContactsService>(ContactsService);
  });

  describe('getContact', () => {
    it('should return contact by ID', async () => {
      mockClient.crm.contacts.basicApi.getById.mockResolvedValue(mockContacts.dormant);

      const result = await service.getContact('123');

      expect(result.id).toBe('123');
      expect(result.properties.email).toBe('dormant@test.com');
    });
  });

  describe('searchDormantContacts', () => {
    it('should find contacts with no activity in specified days', async () => {
      const dormantDate = new Date();
      dormantDate.setDate(dormantDate.getDate() - 60);

      mockClient.crm.contacts.searchApi.doSearch.mockResolvedValue({
        results: [mockContacts.dormant],
        paging: { next: null },
      });

      const result = await service.searchDormantContacts(60);

      expect(result).toHaveLength(1);
      expect(mockClient.crm.contacts.searchApi.doSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          filterGroups: expect.arrayContaining([
            expect.objectContaining({
              filters: expect.arrayContaining([
                expect.objectContaining({
                  propertyName: 'notes_last_updated',
                  operator: 'LT',
                }),
              ]),
            }),
          ]),
        })
      );
    });

    it('should handle pagination for large result sets', async () => {
      // First page
      mockClient.crm.contacts.searchApi.doSearch
        .mockResolvedValueOnce({
          results: Array(100).fill(mockContacts.dormant),
          paging: { next: { after: '100' } },
        })
        // Second page
        .mockResolvedValueOnce({
          results: Array(50).fill(mockContacts.dormant),
          paging: { next: null },
        });

      const result = await service.searchDormantContacts(60);

      expect(result).toHaveLength(150);
      expect(mockClient.crm.contacts.searchApi.doSearch).toHaveBeenCalledTimes(2);
    });
  });
});
```

---

## 6. Testing Dormancy Detection

### Dormancy Rules Service Test

Create `apps/backend/src/campaigns/services/dormancy-rules.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { DormancyRulesService } from './dormancy-rules.service';
import { Repository } from 'typeorm';
import { DormancyRule } from '../../entities/dormancy-rule.entity';
import { getRepositoryToken } from '@nestjs/typeorm';

describe('DormancyRulesService', () => {
  let service: DormancyRulesService;
  let repository: Repository<DormancyRule>;

  const mockRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DormancyRulesService,
        { provide: getRepositoryToken(DormancyRule), useValue: mockRepository },
      ],
    }).compile();

    service = module.get<DormancyRulesService>(DormancyRulesService);
    repository = module.get<Repository<DormancyRule>>(getRepositoryToken(DormancyRule));
  });

  describe('evaluateContact', () => {
    const mockRules: DormancyRule[] = [
      {
        id: '1',
        name: 'No email opens',
        field: 'hs_email_last_open_date',
        operator: 'older_than_days',
        value: '30',
        priority: 1,
        isActive: true,
      } as DormancyRule,
      {
        id: '2',
        name: 'No page views',
        field: 'hs_analytics_last_visit_timestamp',
        operator: 'older_than_days',
        value: '60',
        priority: 2,
        isActive: true,
      } as DormancyRule,
    ];

    it('should identify dormant contact matching all rules', () => {
      const dormantContact = {
        properties: {
          hs_email_last_open_date: '2025-10-01T00:00:00Z', // > 30 days ago
          hs_analytics_last_visit_timestamp: '2025-09-01T00:00:00Z', // > 60 days ago
        },
      };

      const result = service.evaluateContact(dormantContact, mockRules);

      expect(result.isDormant).toBe(true);
      expect(result.matchedRules).toHaveLength(2);
    });

    it('should NOT flag active contact', () => {
      const activeContact = {
        properties: {
          hs_email_last_open_date: new Date().toISOString(), // Today
          hs_analytics_last_visit_timestamp: new Date().toISOString(),
        },
      };

      const result = service.evaluateContact(activeContact, mockRules);

      expect(result.isDormant).toBe(false);
      expect(result.matchedRules).toHaveLength(0);
    });

    it('should handle missing property values', () => {
      const contactWithMissingData = {
        properties: {
          hs_email_last_open_date: null,
          // hs_analytics_last_visit_timestamp is undefined
        },
      };

      const result = service.evaluateContact(contactWithMissingData, mockRules);

      // Should treat null/undefined as "never" (very dormant)
      expect(result.isDormant).toBe(true);
    });
  });
});
```

---

## 7. Integration Tests with Real HubSpot API

### Setup Test Environment

Create `apps/backend/test/hubspot-integration.e2e-spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('HubSpot Integration (e2e)', () => {
  let app: INestApplication;

  // Use environment variables for test credentials
  const TEST_ACCESS_TOKEN = process.env.HUBSPOT_TEST_ACCESS_TOKEN;

  beforeAll(async () => {
    // Skip if no test token provided
    if (!TEST_ACCESS_TOKEN) {
      console.warn('Skipping HubSpot integration tests - no test token');
      return;
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('GET /hubspot/contacts', () => {
    it('should fetch contacts from HubSpot', async () => {
      if (!TEST_ACCESS_TOKEN) return;

      const response = await request(app.getHttpServer())
        .get('/hubspot/contacts')
        .set('Authorization', `Bearer ${TEST_ACCESS_TOKEN}`)
        .expect(200);

      expect(response.body).toHaveProperty('results');
      expect(Array.isArray(response.body.results)).toBe(true);
    });
  });

  describe('GET /hubspot/contacts/dormant', () => {
    it('should find dormant contacts based on rules', async () => {
      if (!TEST_ACCESS_TOKEN) return;

      const response = await request(app.getHttpServer())
        .get('/hubspot/contacts/dormant')
        .query({ days: 60 })
        .set('Authorization', `Bearer ${TEST_ACCESS_TOKEN}`)
        .expect(200);

      expect(response.body).toHaveProperty('contacts');
      expect(response.body).toHaveProperty('total');
    });
  });
});
```

### Run Integration Tests

```bash
# Set test credentials
export HUBSPOT_TEST_ACCESS_TOKEN="your-test-portal-access-token"

# Run integration tests only
cd apps/backend
pnpm test:e2e --grep "HubSpot Integration"
```

---

## 8. Testing Webhooks

### HubSpot Webhook Setup

1. In your HubSpot app settings, go to **Webhooks**
2. Create webhook subscriptions:
   - Contact created
   - Contact updated
   - Email opened
   - Email clicked

### Local Webhook Testing with ngrok

```bash
# Install ngrok
brew install ngrok

# Expose your local server
ngrok http 3000

# You'll get a URL like: https://abc123.ngrok.io
```

Update your HubSpot webhook URL to:
```
https://abc123.ngrok.io/hubspot/webhooks
```

### Webhook Handler Test

Create `apps/backend/src/hubspot/controllers/webhooks.controller.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from '../services/webhooks.service';
import * as crypto from 'crypto';

describe('WebhooksController', () => {
  let controller: WebhooksController;
  let service: WebhooksService;

  const mockWebhooksService = {
    processWebhook: jest.fn(),
    verifySignature: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [
        { provide: WebhooksService, useValue: mockWebhooksService },
      ],
    }).compile();

    controller = module.get<WebhooksController>(WebhooksController);
    service = module.get<WebhooksService>(WebhooksService);
  });

  describe('POST /hubspot/webhooks', () => {
    it('should process valid contact.propertyChange webhook', async () => {
      const webhookPayload = [
        {
          eventId: 123,
          subscriptionId: 456,
          portalId: 789,
          occurredAt: Date.now(),
          subscriptionType: 'contact.propertyChange',
          propertyName: 'email',
          propertyValue: 'new@email.com',
          objectId: 123456,
        },
      ];

      mockWebhooksService.verifySignature.mockReturnValue(true);
      mockWebhooksService.processWebhook.mockResolvedValue({ processed: true });

      const result = await controller.handleWebhook(
        webhookPayload,
        { 'x-hubspot-signature': 'valid-signature' }
      );

      expect(mockWebhooksService.processWebhook).toHaveBeenCalledWith(webhookPayload);
      expect(result).toEqual({ processed: true });
    });

    it('should reject invalid signature', async () => {
      mockWebhooksService.verifySignature.mockReturnValue(false);

      await expect(
        controller.handleWebhook([], { 'x-hubspot-signature': 'invalid' })
      ).rejects.toThrow('Invalid signature');
    });
  });

  describe('Signature Verification', () => {
    it('should verify HubSpot webhook signature', () => {
      const clientSecret = 'test-secret';
      const requestBody = JSON.stringify([{ eventId: 123 }]);

      // HubSpot signature is SHA-256 hash of clientSecret + requestBody
      const expectedSignature = crypto
        .createHash('sha256')
        .update(clientSecret + requestBody)
        .digest('hex');

      const isValid = service.verifySignature(
        requestBody,
        expectedSignature,
        clientSecret
      );

      expect(isValid).toBe(true);
    });
  });
});
```

---

## 9. Testing AI Message Generation

### Mock OpenAI for Tests

Create `apps/backend/src/test/mocks/openai.mock.ts`:

```typescript
export const createMockOpenAI = () => ({
  chat: {
    completions: {
      create: jest.fn(),
    },
  },
});

export const mockAIResponses = {
  emailSubject: 'Re-engaging with Your Goals',
  emailBody: `Hi {{firstname}},

I noticed it's been a while since we last connected. I wanted to reach out and see how things are going with your project.

Would you have 15 minutes this week for a quick catch-up call?

Best regards`,
  smsMessage: 'Hi {{firstname}}! Just checking in - any updates on your project? Reply YES to chat.',
};
```

### Generator Service Test

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { GeneratorService } from './generator.service';
import { createMockOpenAI, mockAIResponses } from '../../test/mocks/openai.mock';

describe('GeneratorService', () => {
  let service: GeneratorService;
  let mockOpenAI: ReturnType<typeof createMockOpenAI>;

  beforeEach(async () => {
    mockOpenAI = createMockOpenAI();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeneratorService,
        { provide: 'OPENAI_CLIENT', useValue: mockOpenAI },
      ],
    }).compile();

    service = module.get<GeneratorService>(GeneratorService);
  });

  describe('generateEmailContent', () => {
    it('should generate personalized email for dormant lead', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                subject: mockAIResponses.emailSubject,
                body: mockAIResponses.emailBody,
              }),
            },
          },
        ],
        usage: { total_tokens: 150 },
      });

      const contact = {
        properties: {
          firstname: 'John',
          lastname: 'Doe',
          company: 'Acme Corp',
          jobtitle: 'Manager',
        },
      };

      const result = await service.generateEmailContent(contact, {
        tone: 'professional',
        purpose: 'reengagement',
      });

      expect(result.subject).toBe(mockAIResponses.emailSubject);
      expect(result.body).toContain('{{firstname}}');
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4o',
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'system' }),
            expect.objectContaining({ role: 'user' }),
          ]),
        })
      );
    });

    it('should track token usage', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: '{}' } }],
        usage: { total_tokens: 200 },
      });

      const result = await service.generateEmailContent({}, {});

      expect(result.tokensUsed).toBe(200);
    });
  });
});
```

---

## 10. End-to-End Test Flow

### Complete Campaign Test

Create `apps/backend/test/campaign-flow.e2e-spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Campaign Flow (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should complete full reactivation campaign flow', async () => {
    // 1. Create dormancy rule
    const ruleResponse = await request(app.getHttpServer())
      .post('/rules')
      .send({
        name: 'No activity 60 days',
        field: 'notes_last_updated',
        operator: 'older_than_days',
        value: '60',
      })
      .expect(201);

    const ruleId = ruleResponse.body.id;

    // 2. Scan for dormant contacts
    const scanResponse = await request(app.getHttpServer())
      .post('/campaigns/scan')
      .send({ ruleIds: [ruleId] })
      .expect(200);

    expect(scanResponse.body.dormantContacts).toBeGreaterThan(0);

    // 3. Create campaign
    const campaignResponse = await request(app.getHttpServer())
      .post('/campaigns')
      .send({
        name: 'Test Reactivation Campaign',
        contactIds: scanResponse.body.contactIds.slice(0, 5),
        channel: 'email',
        aiSettings: {
          tone: 'friendly',
          purpose: 'reengagement',
        },
      })
      .expect(201);

    const campaignId = campaignResponse.body.id;

    // 4. Generate messages
    const generateResponse = await request(app.getHttpServer())
      .post(`/campaigns/${campaignId}/generate`)
      .expect(200);

    expect(generateResponse.body.variants).toHaveLength(5);

    // 5. Review and approve (or auto-approve in test)
    await request(app.getHttpServer())
      .post(`/campaigns/${campaignId}/approve`)
      .send({ variantIds: generateResponse.body.variants.map(v => v.id) })
      .expect(200);

    // 6. Execute campaign (mock sending)
    const executeResponse = await request(app.getHttpServer())
      .post(`/campaigns/${campaignId}/execute`)
      .expect(200);

    expect(executeResponse.body.sent).toBe(5);
    expect(executeResponse.body.failed).toBe(0);
  });
});
```

---

## 11. Running Tests

### Test Commands Summary

```bash
# From project root
pnpm test                    # Run all tests
pnpm test:watch              # Watch mode
pnpm test:cov                # With coverage

# Backend only
cd apps/backend
pnpm test                    # Unit tests
pnpm test:e2e                # Integration tests
pnpm test:cov                # Coverage report

# Frontend only
cd apps/frontend
pnpm test                    # Vitest tests
pnpm test:coverage           # With coverage

# Specific test file
pnpm test -- oauth.service.spec.ts

# Specific test pattern
pnpm test -- --grep "dormant"
```

### CI/CD Pipeline Example

Create `.github/workflows/test.yml`:

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_PASSWORD: test
          POSTGRES_DB: test
        ports:
          - 5432:5432
      redis:
        image: redis:7
        ports:
          - 6379:6379

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v2
        with:
          version: 8

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - run: pnpm install

      - name: Run unit tests
        run: pnpm test

      - name: Run e2e tests
        run: pnpm test:e2e
        env:
          DATABASE_URL: postgres://postgres:test@localhost:5432/test
          REDIS_URL: redis://localhost:6379
```

---

## Quick Reference Checklist

- [ ] Create HubSpot developer account
- [ ] Create test portal (sandbox)
- [ ] Register your app and get credentials
- [ ] Set up OAuth redirect URLs
- [ ] Create test contacts with varying dormancy
- [ ] Write unit tests with mocked HubSpot client
- [ ] Write integration tests for API endpoints
- [ ] Set up ngrok for webhook testing
- [ ] Test OAuth flow manually
- [ ] Test webhook delivery
- [ ] Run full e2e campaign test
- [ ] Set up CI/CD pipeline

---

## Useful Links

- [HubSpot Developer Portal](https://developers.hubspot.com/)
- [HubSpot API Documentation](https://developers.hubspot.com/docs/api/overview)
- [HubSpot OAuth Guide](https://developers.hubspot.com/docs/api/oauth-quickstart-guide)
- [HubSpot Webhooks](https://developers.hubspot.com/docs/api/webhooks)
- [NestJS Testing](https://docs.nestjs.com/fundamentals/testing)
- [Jest Documentation](https://jestjs.io/docs/getting-started)
