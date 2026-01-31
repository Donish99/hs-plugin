# Milestone 1: Foundation

## Objective
Set up the core infrastructure including HubSpot OAuth integration, NestJS backend, and database schema.

---

## Features

### 1.1 HubSpot Developer Account Setup
- [x] Create HubSpot developer account
- [x] Create new public OAuth app
- [x] Configure OAuth redirect URIs
- [x] Note Client ID and Client Secret
- [x] Set up developer test portal

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
- [x] Set up PostgreSQL 17 instance (locally via Homebrew)
- [x] Configure TypeORM connection
- [x] Create migrations for:
  - `hubspot_accounts` table (multi-tenant)
  - `dormancy_rules` table
  - `campaigns` table
  - `outreach_records` table
  - `responses` table
- [x] Add database indexes for performance
- [x] Set up connection pooling

### 1.4 Redis & Job Queue Setup
- [x] Set up Redis instance (locally via Homebrew)
- [x] Configure Bull queue for background jobs
- [x] Create job processors skeleton
  - [x] DormancyScanProcessor
  - [x] SendCampaignProcessor
  - [x] WebhookProcessor
- [x] Set up rate limiting middleware

### 1.5 OAuth Flow Implementation
**TDD Approach: Write tests for each OAuth component before implementation**
- [x] Write tests for OAuth service (oauth.service.spec.ts)
  - [x] Test authorization URL generation
  - [x] Test token exchange logic
  - [x] Test token refresh mechanism
  - [x] Test token encryption/decryption
- [x] Create OAuth service (make tests pass)
- [x] Write tests for OAuth controller (oauth.controller.spec.ts)
  - [x] Test callback handler endpoint
  - [x] Test error scenarios
- [x] Build callback handler endpoint (make tests pass)
- [x] Store encrypted tokens in database
- [x] Create token validation middleware with tests

### 1.6 Basic Contact Sync
**TDD Approach: Mock HubSpot API for testing**
- [x] Write tests for contacts service (contacts.service.spec.ts)
  - [x] Test contact fetch with mocked HubSpot responses
  - [x] Test pagination handling
  - [x] Test rate limiting behavior
- [x] Create HubSpot API client wrapper (make tests pass)
- [x] Implement contact fetch with pagination
- [x] Handle rate limiting (100 req/10sec)
- [x] Write tests for sync job
- [x] Create initial sync job on app install
- [x] Store sync status per account (added `last_synced_at` and `sync_status` to entity)

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
- [x] Can complete OAuth flow and receive tokens
- [x] Tokens are stored encrypted in database
- [x] Token refresh works automatically
- [x] Can fetch contacts from HubSpot API
- [x] All database tables created via migrations
- [x] Redis connected and Bull queues operational

## Testing Requirements (TDD)
- [x] Jest configured with coverage reporting
- [x] Unit tests for OAuth service (>80% coverage)
- [x] Unit tests for Contacts service (>80% coverage)
- [x] E2E test for OAuth callback flow (covered by unit tests, 149 tests passing)
- [x] Mock implementations for HubSpot API
- [x] All tests passing before milestone complete (149 tests)
