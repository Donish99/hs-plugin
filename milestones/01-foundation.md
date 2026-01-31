# Milestone 1: Foundation

## Objective
Set up the core infrastructure including HubSpot OAuth integration, NestJS backend, and database schema.

---

## Features

### 1.1 HubSpot Developer Account Setup
- [x] Create HubSpot developer account
- [ ] Create new public OAuth app
- [ ] Configure OAuth redirect URIs
- [ ] Note Client ID and Client Secret
- [ ] Set up developer test portal

### 1.2 NestJS Backend Structure
- [x] Initialize NestJS project
- [x] Configure TypeScript settings
- [x] Set up environment configuration
- [x] **Set up Jest testing framework**
  - [x] Configure Jest for unit tests
  - [x] Configure Jest for E2E tests
  - [x] Set up test coverage reporting
  - [x] Create test utilities and helpers
- [x] Create module structure:
  - `hubspot` module
  - `campaigns` module
  - `ai` module
  - `outreach` module
- [x] Set up health check endpoint
  - [x] Write tests for health check endpoint first (TDD)
- [x] Configure CORS and security middleware

### 1.3 Database Setup (PostgreSQL)
- [ ] Set up PostgreSQL instance
- [ ] Configure TypeORM connection
- [ ] Create migrations for:
  - `hubspot_accounts` table (multi-tenant)
  - `dormancy_rules` table
  - `campaigns` table
  - `outreach_records` table
  - `responses` table
- [ ] Add database indexes for performance
- [ ] Set up connection pooling

### 1.4 Redis & Job Queue Setup
- [ ] Set up Redis instance
- [ ] Configure Bull queue for background jobs
- [ ] Create job processors skeleton
- [ ] Set up rate limiting middleware

### 1.5 OAuth Flow Implementation
**TDD Approach: Write tests for each OAuth component before implementation**
- [ ] Write tests for OAuth service (oauth.service.spec.ts)
  - [ ] Test authorization URL generation
  - [ ] Test token exchange logic
  - [ ] Test token refresh mechanism
  - [ ] Test token encryption/decryption
- [ ] Create OAuth service (make tests pass)
- [ ] Write tests for OAuth controller (oauth.controller.spec.ts)
  - [ ] Test callback handler endpoint
  - [ ] Test error scenarios
- [ ] Build callback handler endpoint (make tests pass)
- [ ] Store encrypted tokens in database
- [ ] Create token validation middleware with tests

### 1.6 Basic Contact Sync
**TDD Approach: Mock HubSpot API for testing**
- [ ] Write tests for contacts service (contacts.service.spec.ts)
  - [ ] Test contact fetch with mocked HubSpot responses
  - [ ] Test pagination handling
  - [ ] Test rate limiting behavior
- [ ] Create HubSpot API client wrapper (make tests pass)
- [ ] Implement contact fetch with pagination
- [ ] Handle rate limiting (100 req/10sec)
- [ ] Write tests for sync job
- [ ] Create initial sync job on app install
- [ ] Store sync status per account

---

## Technical Details

### Required OAuth Scopes
```
crm.objects.contacts.read
crm.objects.contacts.write
crm.objects.deals.read
crm.objects.companies.read
sales-email-read
crm.objects.emails.write
crm.objects.tasks.write
crm.objects.communications.write
automation.sequences.read
automation.sequences.write
crm.lists.read
crm.objects.users.read
```

### Database Tables (Core)
```sql
hubspot_accounts (
  id, portal_id, company_name,
  access_token_encrypted, refresh_token_encrypted, token_expires_at,
  settings, plan, monthly_email_limit, emails_sent_this_month
)
```

### Key Files to Create
- `src/hubspot/hubspot.module.ts`
- `src/hubspot/services/oauth.service.ts`
- `src/hubspot/services/contacts.service.ts`
- `src/hubspot/controllers/oauth.controller.ts`
- `src/config/database.config.ts`
- `src/config/redis.config.ts`

---

## Acceptance Criteria
- [ ] Can complete OAuth flow and receive tokens
- [ ] Tokens are stored encrypted in database
- [ ] Token refresh works automatically
- [ ] Can fetch contacts from HubSpot API
- [ ] All database tables created via migrations
- [ ] Redis connected and Bull queues operational

## Testing Requirements (TDD)
- [x] Jest configured with coverage reporting
- [ ] Unit tests for OAuth service (>80% coverage)
- [ ] Unit tests for Contacts service (>80% coverage)
- [ ] E2E test for OAuth callback flow
- [x] Mock implementations for HubSpot API
- [ ] All tests passing before milestone complete
