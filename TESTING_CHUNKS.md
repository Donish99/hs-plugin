# Manual Testing Chunks - HubSpot Dormant Lead Reactivation Plugin

This document divides the codebase into meaningful chunks for systematic manual testing.
Work through each chunk sequentially - later chunks depend on earlier ones.

---

## Testing Order Overview

| # | Chunk | Layer | Dependencies |
|---|-------|-------|--------------|
| 1 | Database & Entities | Database | PostgreSQL |
| 2 | Redis & Queues | Cache | Redis |
| 3 | Health Checks | Backend | DB + Redis |
| 4 | HubSpot OAuth | Backend | Chunk 1-3 |
| 5 | HubSpot Contacts API | Backend | Chunk 4 |
| 6 | Dormancy Rules CRUD | Backend | Chunk 4 |
| 7 | Dormancy Detection & Scanning | Backend | Chunk 5-6 |
| 8 | AI Context Gathering | Backend | Chunk 5 |
| 9 | AI Message Generation | Backend | Chunk 8, OpenAI |
| 10 | Message Variants & A/B Testing | Backend | Chunk 9 |
| 11 | Review Queue | Backend | Chunk 10 |
| 12 | Email Sending (SendGrid) | Backend | Chunk 11 |
| 13 | SMS Sending (Twilio) | Backend | Chunk 11 |
| 14 | Campaign Lifecycle | Backend | Chunk 12-13 |
| 15 | Webhooks & Response Classification | Backend | Chunk 14 |
| 16 | Analytics & Metrics | Backend | Chunk 14-15 |
| 17 | Background Jobs | Backend | All backend |
| 18 | Frontend - Auth & Layout | Frontend | Chunk 4 |
| 19 | Frontend - Dashboard | Frontend | Chunk 16, 18 |
| 20 | Frontend - Leads Management | Frontend | Chunk 5, 7, 18 |
| 21 | Frontend - Rules Management | Frontend | Chunk 6, 18 |
| 22 | Frontend - Campaigns | Frontend | Chunk 14, 18 |
| 23 | Frontend - Message Review | Frontend | Chunk 11, 18 |
| 24 | Frontend - Analytics | Frontend | Chunk 16, 18 |
| 25 | Frontend - Settings | Frontend | Chunk 18 |
| 26 | HubSpot UI Extension | Extension | Chunk 4, 18 |

---

## CHUNK 1: Database & Entities

**Layer:** PostgreSQL + TypeORM
**Purpose:** Verify database connection, migrations, and entity integrity

### Key Files
```
apps/backend/src/config/database.config.ts
apps/backend/src/entities/
├── hubspot-account.entity.ts
├── dormancy-rule.entity.ts
├── campaign.entity.ts
├── outreach-record.entity.ts
├── message-variant.entity.ts
├── review-queue.entity.ts
└── response.entity.ts
apps/backend/src/migrations/
├── 1706700000000-InitialSchema.ts
├── 1706700000001-AddScheduledAtToOutreach.ts
├── 1706700000002-AddAccountColumns.ts
└── 1706700000003-AddMessageVariantsAndReviewQueue.ts
```

### Test Scenarios
- [ ] Database connection successful
- [ ] All migrations run without errors
- [ ] Tables created: `hubspot_accounts`, `dormancy_rules`, `campaigns`, `outreach_records`, `responses`, `message_variants`, `review_queue`
- [ ] Indexes created correctly
- [ ] Foreign key constraints work (cascade delete)
- [ ] JSONB columns accept valid JSON
- [ ] Enum columns enforce values
- [ ] Entity methods work (`isAtEmailLimit()`, `canTransitionTo()`, etc.)

### Commands
```bash
cd apps/backend
pnpm migration:run
pnpm test -- --grep "entity"
```

---

## CHUNK 2: Redis & Queues

**Layer:** Redis + Bull
**Purpose:** Verify Redis connection and queue configuration

### Key Files
```
apps/backend/src/config/redis.config.ts
apps/backend/src/jobs/
├── base.processor.ts
└── (all processor files use these queues)
```

### Queue Names
- `dormancy-scan`
- `send-campaign`
- `webhook-process`
- `token-refresh`
- `contact-sync`
- `classification`

### Test Scenarios
- [ ] Redis connection successful
- [ ] Each queue can be accessed
- [ ] Jobs can be added to queues
- [ ] Retry logic configured (3 attempts, exponential backoff)
- [ ] TLS works for `rediss://` URLs

### Commands
```bash
redis-cli ping
pnpm test -- --grep "redis|queue"
```

---

## CHUNK 3: Health Checks

**Layer:** NestJS Terminus
**Purpose:** Verify health endpoint reports all dependencies

### Key Files
```
apps/backend/src/health/
├── health.module.ts
└── health.controller.ts
```

### Test Scenarios
- [ ] `GET /health` returns 200 when all healthy
- [ ] Database health indicator works
- [ ] Redis health indicator works
- [ ] Reports unhealthy when DB down
- [ ] Reports unhealthy when Redis down

### Endpoint
```
GET http://localhost:3000/health
```

---

## CHUNK 4: HubSpot OAuth

**Layer:** Backend - HubSpot Module
**Purpose:** Complete OAuth flow and token management

### Key Files
```
apps/backend/src/hubspot/
├── hubspot.module.ts
├── controllers/oauth.controller.ts
├── services/
│   ├── oauth.service.ts
│   └── oauth-state.service.ts
└── middleware/token-validation.middleware.ts
```

### Test Scenarios
- [ ] `GET /api/hubspot/oauth/authorize` returns redirect URL
- [ ] OAuth state generated and validated
- [ ] `GET /api/hubspot/oauth/callback` exchanges code for tokens
- [ ] Tokens encrypted before storage (AES-256-GCM)
- [ ] Tokens decrypted correctly for API calls
- [ ] Token refresh works when expiring
- [ ] `POST /api/hubspot/oauth/disconnect` revokes tokens
- [ ] Account created/updated in database
- [ ] TokenValidationMiddleware attaches portalId to request

### Endpoints
```
GET  /api/hubspot/oauth/authorize
GET  /api/hubspot/oauth/callback?code=xxx
POST /api/hubspot/oauth/disconnect
GET  /api/hubspot/oauth/status
```

---

## CHUNK 5: HubSpot Contacts API

**Layer:** Backend - HubSpot Module
**Purpose:** Fetch and search contacts from HubSpot

### Key Files
```
apps/backend/src/hubspot/services/contacts.service.ts
```

### Test Scenarios
- [ ] `getContacts()` returns paginated contacts
- [ ] `getContactById()` fetches single contact
- [ ] `searchContacts()` with filters works
- [ ] `getDormantContacts()` with dormancy criteria
- [ ] `getContactDeals()` fetches associated deals
- [ ] `getContactEmails()` fetches email history
- [ ] `getContactCompany()` fetches company details
- [ ] Rate limiting handles 429 errors (retry with backoff)
- [ ] Properties include: email, firstname, lastname, company, jobtitle, last_contacted

### Endpoints
```
GET /api/accounts/:accountId/contacts
GET /api/accounts/:accountId/contacts/:contactId
POST /api/accounts/:accountId/contacts/search
```

---

## CHUNK 6: Dormancy Rules CRUD

**Layer:** Backend - Campaigns Module
**Purpose:** Create, read, update, delete dormancy rules

### Key Files
```
apps/backend/src/campaigns/
├── controllers/rules.controller.ts
└── services/dormancy-rules.service.ts
apps/backend/src/entities/dormancy-rule.entity.ts
```

### Test Scenarios
- [ ] `POST /rules` creates new rule
- [ ] `GET /rules` lists all rules for account
- [ ] `GET /rules/:id` fetches single rule
- [ ] `PUT /rules/:id` updates rule
- [ ] `DELETE /rules/:id` deletes rule
- [ ] Rule criteria validated (JSONB structure)
- [ ] Action types: EMAIL, SMS, SEQUENCE, TASK
- [ ] Rules cascade delete with account

### Endpoints
```
GET    /api/accounts/:accountId/rules
POST   /api/accounts/:accountId/rules
GET    /api/accounts/:accountId/rules/:ruleId
PUT    /api/accounts/:accountId/rules/:ruleId
DELETE /api/accounts/:accountId/rules/:ruleId
```

### Rule Criteria Fields
```json
{
  "min_days_inactive": 30,
  "no_email_opens_days": 14,
  "no_email_clicks_days": 30,
  "no_website_visits_days": 60,
  "deal_stages": ["closedlost", "stale"],
  "exclude_tags": ["vip", "do-not-contact"],
  "min_lead_score": 50
}
```

---

## CHUNK 7: Dormancy Detection & Scanning

**Layer:** Backend - Campaigns Module
**Purpose:** Identify dormant leads based on rules

### Key Files
```
apps/backend/src/campaigns/services/
├── query-builder.service.ts
├── scanner.service.ts
├── dormancy-detection.service.ts
└── actions.service.ts
```

### Test Scenarios
- [ ] QueryBuilderService creates valid HubSpot queries
- [ ] ScannerService executes scan for single rule
- [ ] ScannerService executes scan for all rules
- [ ] DormancyDetectionService scores leads
- [ ] Leads filtered by exclusion criteria
- [ ] ActionsService creates campaigns from results
- [ ] Scan status tracked (`pending` → `syncing` → `completed`)

### Endpoints
```
POST /api/accounts/:accountId/scans/run
GET  /api/accounts/:accountId/scans/status
POST /api/accounts/:accountId/rules/:ruleId/scan
```

---

## CHUNK 8: AI Context Gathering

**Layer:** Backend - AI Module
**Purpose:** Gather contact/company context for AI prompts

### Key Files
```
apps/backend/src/ai/services/context.service.ts
```

### Test Scenarios
- [ ] Fetches contact details (name, email, company, title)
- [ ] Fetches deal history (stage, amount, close date)
- [ ] Fetches email history (recent emails, engagement)
- [ ] Fetches company details (industry, size, revenue)
- [ ] Context cached (1 hour TTL)
- [ ] Handles missing data gracefully

---

## CHUNK 9: AI Message Generation

**Layer:** Backend - AI Module
**Purpose:** Generate personalized messages using OpenAI

### Key Files
```
apps/backend/src/ai/
├── controllers/generation.controller.ts
└── services/
    ├── openai.service.ts
    ├── prompt.service.ts
    └── generator.service.ts
```

### Test Scenarios
- [ ] OpenAI API connection works
- [ ] PromptService creates valid prompts
- [ ] GeneratorService generates single message
- [ ] Message subject ≤ 60 characters
- [ ] Token usage tracked (prompt + completion)
- [ ] Cost calculated ($2.50/1M input, $10/1M output)
- [ ] Retry logic on transient failures (max 3)
- [ ] Invalid responses rejected and retried

### Endpoints
```
POST /api/accounts/:accountId/generate
POST /api/accounts/:accountId/generate/preview
```

---

## CHUNK 10: Message Variants & A/B Testing

**Layer:** Backend - AI Module
**Purpose:** Generate multiple message variants for A/B testing

### Key Files
```
apps/backend/src/ai/services/variant.service.ts
apps/backend/src/entities/message-variant.entity.ts
```

### Test Scenarios
- [ ] `generateVariants()` creates 3 variants (professional, casual, curious)
- [ ] Each variant stored in MessageVariant table
- [ ] variantGroupId links related variants
- [ ] Context snapshot saved for analysis
- [ ] Variant selection tracked (`isSelected`)
- [ ] Token usage per variant recorded

### Tones
- `professional` - Formal business tone
- `casual` - Friendly conversational tone
- `curious` - Question-driven engagement tone

---

## CHUNK 11: Review Queue

**Layer:** Backend - AI Module
**Purpose:** Human review workflow for AI-generated messages

### Key Files
```
apps/backend/src/ai/
├── controllers/review.controller.ts
└── services/review.service.ts
apps/backend/src/entities/review-queue.entity.ts
```

### Test Scenarios
- [ ] Messages added to queue when review required
- [ ] `GET /reviews` lists pending reviews (priority order)
- [ ] `POST /reviews/:id/approve` approves message
- [ ] `POST /reviews/:id/edit` saves edits + approves
- [ ] `POST /reviews/:id/reject` rejects with reason
- [ ] Auto-approval works based on account settings
- [ ] Original and edited content both stored
- [ ] Status transitions: `PENDING` → `APPROVED`/`EDITED`/`REJECTED`

### Endpoints
```
GET  /api/accounts/:accountId/reviews
GET  /api/accounts/:accountId/reviews/:reviewId
POST /api/accounts/:accountId/reviews/:reviewId/approve
POST /api/accounts/:accountId/reviews/:reviewId/edit
POST /api/accounts/:accountId/reviews/:reviewId/reject
```

---

## CHUNK 12: Email Sending (SendGrid)

**Layer:** Backend - Outreach Module
**Purpose:** Send emails via SendGrid

### Key Files
```
apps/backend/src/outreach/
├── services/email.service.ts
└── services/hubspot-logger.service.ts
```

### Test Scenarios
- [ ] SendGrid API connection works
- [ ] Email sent successfully
- [ ] `sendgridMessageId` stored in OutreachRecord
- [ ] Bounce handling works
- [ ] Retry on transient failures
- [ ] Email logged to HubSpot timeline
- [ ] Status updated: `PENDING` → `SENT` → `DELIVERED`

### Requires
- `SENDGRID_API_KEY` environment variable
- Verified sender domain in SendGrid

---

## CHUNK 13: SMS Sending (Twilio)

**Layer:** Backend - Outreach Module
**Purpose:** Send SMS via Twilio

### Key Files
```
apps/backend/src/outreach/
├── services/sms.service.ts
└── twilio.factory.ts
```

### Test Scenarios
- [ ] Twilio client created correctly
- [ ] SMS sent successfully
- [ ] `twilioMessageSid` stored in OutreachRecord
- [ ] Phone number formatting works
- [ ] Retry on transient failures
- [ ] Status updated: `PENDING` → `SENT` → `DELIVERED`

### Requires
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE` env vars

---

## CHUNK 14: Campaign Lifecycle

**Layer:** Backend - Campaigns Module
**Purpose:** Manage campaign status and execution

### Key Files
```
apps/backend/src/campaigns/
├── controllers/campaigns.controller.ts
└── services/campaign.service.ts
apps/backend/src/outreach/services/campaign-executor.service.ts
apps/backend/src/entities/campaign.entity.ts
```

### Test Scenarios
- [ ] Create campaign (`DRAFT`)
- [ ] Schedule campaign (`SCHEDULED`)
- [ ] Start campaign (`RUNNING`)
- [ ] Pause campaign (`PAUSED`)
- [ ] Complete campaign (`COMPLETED`)
- [ ] Valid transitions enforced (`DRAFT` → `SCHEDULED` → `RUNNING`)
- [ ] OutreachRecords created for each contact
- [ ] Campaign metrics updated (sent, opened, replied)
- [ ] Concurrent execution prevented

### Endpoints
```
GET    /api/accounts/:accountId/campaigns
POST   /api/accounts/:accountId/campaigns
GET    /api/accounts/:accountId/campaigns/:id
PUT    /api/accounts/:accountId/campaigns/:id
POST   /api/accounts/:accountId/campaigns/:id/start
POST   /api/accounts/:accountId/campaigns/:id/pause
POST   /api/accounts/:accountId/campaigns/:id/complete
DELETE /api/accounts/:accountId/campaigns/:id
```

### Status Flow
```
DRAFT → SCHEDULED → RUNNING → COMPLETED
                 ↓         ↓
              PAUSED ← ←  ↓
```

---

## CHUNK 15: Webhooks & Response Classification

**Layer:** Backend - HubSpot + AI Modules
**Purpose:** Process HubSpot webhooks and classify responses

### Key Files
```
apps/backend/src/hubspot/
├── controllers/webhooks.controller.ts
└── services/webhooks.service.ts
apps/backend/src/ai/services/classifier.service.ts
apps/backend/src/jobs/
├── webhook.processor.ts
└── classification.processor.ts
apps/backend/src/entities/response.entity.ts
```

### Test Scenarios
- [ ] Webhook signature validated
- [ ] Email open event processed
- [ ] Email click event processed
- [ ] Email reply event processed
- [ ] Meeting booked event processed
- [ ] OutreachRecord status updated
- [ ] Response entity created
- [ ] AI classification: sentiment (positive/neutral/negative)
- [ ] AI classification: intent (interested/not_now/not_interested/unsubscribe/out_of_office)
- [ ] Unsubscribe stops future outreach

### Webhook Endpoint
```
POST /api/webhooks/hubspot
```

### Response Types
- `EMAIL_REPLY`
- `MEETING_BOOKED`
- `PHONE_CALL`

---

## CHUNK 16: Analytics & Metrics

**Layer:** Backend - Analytics Module
**Purpose:** Calculate and serve analytics data

### Key Files
```
apps/backend/src/analytics/
├── controllers/dashboard.controller.ts
└── services/
    ├── metrics.service.ts
    ├── roi.service.ts
    ├── ab-test.service.ts
    └── activity-log.service.ts
```

### Test Scenarios
- [ ] Campaign KPIs: open rate, reply rate, conversion rate
- [ ] ROI calculation based on meetings booked
- [ ] A/B test analysis (variant performance comparison)
- [ ] Activity log retrieval
- [ ] Time-range filtering
- [ ] Per-campaign vs aggregate metrics

### Endpoints
```
GET /api/accounts/:accountId/analytics/dashboard
GET /api/accounts/:accountId/analytics/campaigns/:id
GET /api/accounts/:accountId/analytics/roi
GET /api/accounts/:accountId/analytics/ab-tests
GET /api/accounts/:accountId/activity
```

---

## CHUNK 17: Background Jobs

**Layer:** Backend - Jobs Module
**Purpose:** Verify all background job processors

### Key Files
```
apps/backend/src/jobs/
├── dormancy-scan.processor.ts
├── dormancy-scan.scheduler.ts
├── send-campaign.processor.ts
├── webhook.processor.ts
├── classification.processor.ts
└── contact-sync.processor.ts
```

### Test Scenarios
- [ ] DormancyScanProcessor runs scans
- [ ] Scheduler triggers periodic scans
- [ ] SendCampaignProcessor sends messages
- [ ] WebhookProcessor handles events
- [ ] ClassificationProcessor classifies responses
- [ ] ContactSyncProcessor syncs contacts
- [ ] Failed jobs retry with backoff
- [ ] Job completion logged

---

## CHUNK 18: Frontend - Auth & Layout

**Layer:** Frontend
**Purpose:** OAuth flow and application layout

### Key Files
```
apps/frontend/src/
├── App.tsx
├── features/auth/
│   ├── ConnectPage.tsx
│   ├── OAuthCallback.tsx
│   └── context/AuthContext.tsx
├── components/layout/
│   ├── AppLayout.tsx
│   ├── Header.tsx
│   └── Sidebar.tsx
└── api/
    ├── client.ts
    └── endpoints/auth.ts
```

### Test Scenarios
- [ ] ConnectPage shows "Connect to HubSpot" button
- [ ] Button redirects to HubSpot OAuth
- [ ] OAuthCallback handles success
- [ ] OAuthCallback handles errors
- [ ] AuthContext stores authentication state
- [ ] API client includes portal ID in requests
- [ ] Layout renders with sidebar and header
- [ ] Navigation between pages works
- [ ] Logout clears auth state

### Pages
```
/connect          - HubSpot connection
/oauth/callback   - OAuth callback
/                 - Dashboard (protected)
```

---

## CHUNK 19: Frontend - Dashboard

**Layer:** Frontend
**Purpose:** Overview dashboard with metrics

### Key Files
```
apps/frontend/src/features/dashboard/
├── DashboardPage.tsx
├── components/
│   ├── OverviewMetrics.tsx
│   ├── QuickActions.tsx
│   └── RecentActivity.tsx
└── hooks/useDashboard.ts
```

### Test Scenarios
- [ ] Dashboard loads after auth
- [ ] Overview metrics display (leads, campaigns, responses)
- [ ] Quick actions work (new campaign, scan now)
- [ ] Recent activity shows latest events
- [ ] Loading states handled
- [ ] Error states handled
- [ ] Data refreshes on interval

### Page
```
/dashboard
```

---

## CHUNK 20: Frontend - Leads Management

**Layer:** Frontend
**Purpose:** View and manage dormant leads

### Key Files
```
apps/frontend/src/features/leads/
├── LeadsPage.tsx
├── LeadDetailPage.tsx
├── LeadDetailDrawer.tsx
├── components/LeadsFilters.tsx
└── hooks/useLeads.ts
```

### Test Scenarios
- [ ] Leads list loads with pagination
- [ ] Filters work (dormancy score, days inactive)
- [ ] Search by name/email works
- [ ] Lead detail page shows full info
- [ ] Lead detail drawer opens/closes
- [ ] Contact history displayed
- [ ] Deal information displayed
- [ ] Generate message button works
- [ ] Add to campaign button works

### Pages
```
/leads            - Lead list
/leads/:id        - Lead detail
```

---

## CHUNK 21: Frontend - Rules Management

**Layer:** Frontend
**Purpose:** Create and manage dormancy rules

### Key Files
```
apps/frontend/src/features/rules/
├── RulesPage.tsx
├── RuleEditorPage.tsx
└── components/CriteriaBuilder.tsx
```

### Test Scenarios
- [ ] Rules list shows all rules
- [ ] Create new rule button works
- [ ] Rule editor loads with defaults
- [ ] Criteria builder UI works
- [ ] Add/remove criteria fields
- [ ] Action type selection works
- [ ] Save rule validates inputs
- [ ] Edit existing rule loads data
- [ ] Delete rule with confirmation
- [ ] Rule activation toggle works

### Pages
```
/rules            - Rules list
/rules/new        - Create rule
/rules/:id/edit   - Edit rule
```

---

## CHUNK 22: Frontend - Campaigns

**Layer:** Frontend
**Purpose:** Campaign creation and management

### Key Files
```
apps/frontend/src/features/campaigns/
├── CampaignsPage.tsx
├── CampaignDetailPage.tsx
└── components/CreateCampaignWizard.tsx
```

### Test Scenarios
- [ ] Campaigns list shows all campaigns
- [ ] Filter by status (draft, running, completed)
- [ ] Create campaign wizard opens
- [ ] Step 1: Select rule and leads
- [ ] Step 2: Configure message settings
- [ ] Step 3: Schedule or send now
- [ ] Step 4: Review and confirm
- [ ] Campaign detail shows metrics
- [ ] Start campaign button works
- [ ] Pause campaign button works
- [ ] View individual outreach records

### Pages
```
/campaigns            - Campaign list
/campaigns/new        - Create wizard
/campaigns/:id        - Campaign detail
```

---

## CHUNK 23: Frontend - Message Review

**Layer:** Frontend
**Purpose:** Review AI-generated messages

### Key Files
```
apps/frontend/src/features/reviews/
├── ReviewQueuePage.tsx
└── components/
    ├── ReviewCard.tsx
    └── MessageEditor.tsx
```

### Test Scenarios
- [ ] Review queue shows pending items
- [ ] Priority ordering works
- [ ] Message preview displays correctly
- [ ] Approve button works
- [ ] Edit button opens editor
- [ ] Editor allows text changes
- [ ] Save edits works
- [ ] Reject button opens reason input
- [ ] Rejection recorded with reason
- [ ] Queue refreshes after action
- [ ] Empty state when no reviews

### Page
```
/reviews
```

---

## CHUNK 24: Frontend - Analytics

**Layer:** Frontend
**Purpose:** View performance analytics

### Key Files
```
apps/frontend/src/features/analytics/
├── AnalyticsPage.tsx
└── components/
    ├── MetricsCards.tsx
    ├── CampaignChart.tsx
    └── AbTestResults.tsx
```

### Test Scenarios
- [ ] Analytics page loads
- [ ] Date range picker works
- [ ] Metrics cards show KPIs
- [ ] Charts render correctly
- [ ] A/B test results displayed
- [ ] Export data button works
- [ ] Drill-down to campaign level
- [ ] Compare time periods

### Page
```
/analytics
```

---

## CHUNK 25: Frontend - Settings

**Layer:** Frontend
**Purpose:** Account configuration

### Key Files
```
apps/frontend/src/features/settings/
├── SettingsPage.tsx
└── components/
    ├── AccountSettings.tsx
    ├── NotificationSettings.tsx
    └── IntegrationSettings.tsx
```

### Test Scenarios
- [ ] Settings page loads
- [ ] Account settings editable
- [ ] Timezone selection works
- [ ] Business hours toggle
- [ ] Auto-approve toggle
- [ ] Default tone selection
- [ ] Email limit display
- [ ] Save settings persists
- [ ] Reset to defaults works
- [ ] Disconnect HubSpot button

### Page
```
/settings
```

---

## CHUNK 26: HubSpot UI Extension

**Layer:** HubSpot Extensions
**Purpose:** Native HubSpot CRM UI

### Key Files
```
apps/hubspot-extensions/
├── hsproject.json
├── src/app/
│   ├── app.json
│   └── extensions/
```

### Test Scenarios
- [ ] Extension builds successfully
- [ ] Upload to HubSpot sandbox works
- [ ] Extension appears in HubSpot CRM
- [ ] Contact card extension loads
- [ ] Dormancy score displayed
- [ ] Quick actions work
- [ ] Data syncs with backend
- [ ] Error handling works

### Commands
```bash
cd apps/hubspot-extensions
pnpm start    # Dev mode
pnpm upload   # Upload to HubSpot
```

---

## Testing Commands Summary

```bash
# Start all services for testing
pnpm dev                    # All apps
pnpm dev:backend           # Backend only (port 3000)
pnpm dev:frontend          # Frontend only (port 5173)

# Run tests
pnpm test                  # All tests
pnpm test:watch           # Watch mode
pnpm test:cov             # Coverage report
pnpm test:e2e             # E2E tests

# Database
cd apps/backend
pnpm migration:run         # Run migrations
pnpm migration:revert     # Revert last migration

# HubSpot Extension
cd apps/hubspot-extensions
pnpm start                 # Local dev
pnpm upload               # Deploy to HubSpot
```

---

## Environment Checklist

Before testing, ensure these are configured:

### Backend (.env)
- [ ] `DATABASE_URL` - PostgreSQL connection
- [ ] `REDIS_URL` - Redis connection
- [ ] `HUBSPOT_CLIENT_ID` - HubSpot app ID
- [ ] `HUBSPOT_CLIENT_SECRET` - HubSpot secret
- [ ] `HUBSPOT_APP_ID` - HubSpot app ID
- [ ] `OPENAI_API_KEY` - OpenAI API key
- [ ] `SENDGRID_API_KEY` - SendGrid API key
- [ ] `TWILIO_ACCOUNT_SID` - Twilio SID
- [ ] `TWILIO_AUTH_TOKEN` - Twilio token
- [ ] `TWILIO_PHONE` - Twilio phone number
- [ ] `ENCRYPTION_KEY` - 32-byte hex key for token encryption
- [ ] `APP_URL` - Application URL

### Frontend (.env)
- [ ] `VITE_API_URL` - Backend URL (http://localhost:3000)

---

## Progress Tracker

| Chunk | Status | Tested By | Date | Notes |
|-------|--------|-----------|------|-------|
| 1. Database & Entities | ⬜ | | | |
| 2. Redis & Queues | ⬜ | | | |
| 3. Health Checks | ⬜ | | | |
| 4. HubSpot OAuth | ⬜ | | | |
| 5. HubSpot Contacts API | ⬜ | | | |
| 6. Dormancy Rules CRUD | ⬜ | | | |
| 7. Dormancy Detection | ⬜ | | | |
| 8. AI Context | ⬜ | | | |
| 9. AI Generation | ⬜ | | | |
| 10. Message Variants | ⬜ | | | |
| 11. Review Queue | ⬜ | | | |
| 12. Email Sending | ⬜ | | | |
| 13. SMS Sending | ⬜ | | | |
| 14. Campaign Lifecycle | ⬜ | | | |
| 15. Webhooks & Classification | ⬜ | | | |
| 16. Analytics | ⬜ | | | |
| 17. Background Jobs | ⬜ | | | |
| 18. FE - Auth & Layout | ⬜ | | | |
| 19. FE - Dashboard | ⬜ | | | |
| 20. FE - Leads | ⬜ | | | |
| 21. FE - Rules | ⬜ | | | |
| 22. FE - Campaigns | ⬜ | | | |
| 23. FE - Reviews | ⬜ | | | |
| 24. FE - Analytics | ⬜ | | | |
| 25. FE - Settings | ⬜ | | | |
| 26. HubSpot Extension | ⬜ | | | |
