# HubSpot Dormant Lead Reactivation Plugin - Architecture

## Overview

A monorepo-based HubSpot plugin that identifies dormant leads and re-engages them with AI-generated personalized messages.

---

## Monorepo Structure

```
/hs
├── apps/
│   ├── backend/              # NestJS API (port 3000)
│   ├── frontend/             # React + Vite (port 5173)
│   └── hubspot-extensions/   # HubSpot UI cards
├── packages/
│   └── shared-types/         # Shared TypeScript interfaces
├── milestones/               # Development milestone tracking
└── CLAUDE.md                 # Development guidelines
```

---

## Backend Architecture (NestJS)

### Module Organization

```
AppModule
│
├── HubspotModule
│   ├── OAuthService          # Token management & refresh
│   ├── ContactsService       # HubSpot contact retrieval
│   └── WebhooksService       # Webhook processing
│
├── CampaignsModule
│   ├── DormancyRulesService  # Rule definitions
│   ├── DormancyDetectionService  # Identify dormant leads
│   ├── ScannerService        # Scan HubSpot contacts
│   └── CampaignService       # Campaign CRUD
│
├── AiModule
│   ├── ContextService        # Gather contact context
│   ├── PromptService         # Build AI prompts
│   ├── GeneratorService      # Generate messages (GPT-4o)
│   ├── VariantService        # A/B test variants
│   ├── ReviewService         # Human review queue
│   └── ClassifierService     # Classify responses
│
├── OutreachModule
│   ├── EmailService          # SendGrid integration
│   ├── SmsService            # Twilio integration
│   ├── CampaignExecutorService   # Orchestrate sends
│   ├── DeliveryStatusService # Track delivery
│   └── HubspotLoggerService  # Log activities to HubSpot
│
├── JobsModule
│   ├── DormancyScanProcessor # Scheduled scans
│   ├── SendCampaignProcessor # Async message sending
│   ├── WebhookProcessor      # Process incoming webhooks
│   └── ClassificationProcessor   # AI response classification
│
├── AnalyticsModule
│   ├── MetricsService        # Campaign metrics
│   ├── RoiService            # ROI calculations
│   └── AbTestService         # A/B test analytics
│
└── SettingsModule
    └── SettingsService       # Account preferences
```

### Database Entities

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ HubspotAccount  │────►│   Campaign      │────►│ OutreachRecord  │
│                 │     │                 │     │                 │
│ - portalId      │     │ - name          │     │ - contactId     │
│ - accessToken   │     │ - status        │     │ - channel       │
│ - refreshToken  │     │ - scheduledAt   │     │ - status        │
│ - settings      │     │ - metrics       │     │ - sentAt        │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
        │                       │                        │
        │                       │                        ▼
        ▼                       ▼               ┌─────────────────┐
┌─────────────────┐     ┌─────────────────┐     │    Response     │
│  DormancyRule   │     │ MessageVariant  │     │                 │
│                 │     │                 │     │ - type          │
│ - conditions    │     │ - subject       │     │ - classification│
│ - thresholds    │     │ - body          │     │ - receivedAt    │
│ - channels      │     │ - performance   │     └─────────────────┘
└─────────────────┘     └─────────────────┘
                                │
                                ▼
                        ┌─────────────────┐
                        │  ReviewQueue    │
                        │                 │
                        │ - message       │
                        │ - status        │
                        │ - reviewedBy    │
                        └─────────────────┘
```

### Infrastructure

| Component  | Technology        | Purpose                    |
|------------|-------------------|----------------------------|
| Database   | PostgreSQL 17     | Primary data store         |
| ORM        | TypeORM           | Database abstraction       |
| Cache      | Redis 7           | Queue backend              |
| Queues     | Bull              | Background job processing  |
| Scheduler  | @nestjs/schedule  | Cron jobs                  |

---

## Frontend Architecture (React + Vite)

### Provider Stack

```
React.StrictMode
└── QueryClientProvider (React Query)
    └── BrowserRouter (React Router v6)
        └── AuthProvider (OAuth context)
            └── App
                └── Toaster (notifications)
```

### Feature Structure

```
/src
├── /api
│   ├── client.ts             # Axios instance
│   ├── /endpoints            # API endpoint definitions
│   └── /hooks                # React Query hooks
│
├── /features
│   ├── /auth                 # OAuth flow
│   ├── /dashboard            # Main dashboard
│   ├── /leads                # Lead management
│   ├── /campaigns            # Campaign management
│   ├── /rules                # Dormancy rules
│   ├── /reviews              # Message review queue
│   ├── /analytics            # Reports & metrics
│   ├── /activity             # Activity log
│   └── /settings             # Account settings
│
├── /components
│   ├── /layout               # App shell
│   ├── /ui                   # Reusable UI components
│   ├── /common               # Shared components
│   └── /charts               # Recharts visualizations
│
├── /stores                   # Zustand state stores
├── /hooks                    # Custom React hooks
└── /lib                      # Utilities
```

### Key Libraries

| Library          | Purpose                      |
|------------------|------------------------------|
| React Query      | Server state & caching       |
| Zustand          | Client state management      |
| React Hook Form  | Form handling                |
| Zod              | Schema validation            |
| Radix UI         | Accessible UI primitives     |
| Recharts         | Data visualization           |
| TailwindCSS      | Styling                      |

---

## External Services

```
                                 ┌─────────────────────────────────────┐
                                 │           Backend (NestJS)          │
                                 └───────────────┬─────────────────────┘
                                                 │
         ┌───────────────┬───────────────┬───────┴───────┬───────────────┐
         ▼               ▼               ▼               ▼               ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   HubSpot   │  │   OpenAI    │  │  SendGrid   │  │   Twilio    │  │    Redis    │
│             │  │             │  │             │  │             │  │             │
│ - OAuth     │  │ - GPT-4o    │  │ - Email     │  │ - SMS       │  │ - Bull      │
│ - Contacts  │  │ - Generate  │  │ - Webhooks  │  │ - Validate  │  │ - Queues    │
│ - Timeline  │  │ - Classify  │  │ - Track     │  │ - Deliver   │  │ - Jobs      │
└─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘
```

### Integration Details

| Service   | SDK/Package           | Rate Limits              |
|-----------|-----------------------|--------------------------|
| HubSpot   | @hubspot/api-client   | 100 requests / 10 sec    |
| OpenAI    | openai                | Per-account token limits |
| SendGrid  | @sendgrid/mail        | Plan-based               |
| Twilio    | twilio                | Plan-based               |

---

## Data Flow

### 1. OAuth Flow

```
User clicks "Connect HubSpot"
        │
        ▼
Frontend redirects to HubSpot OAuth
        │
        ▼
HubSpot redirects back with code
        │
        ▼
Backend exchanges code for tokens
        │
        ▼
Tokens encrypted & stored in PostgreSQL
        │
        ▼
User redirected to dashboard
```

### 2. Campaign Execution Flow

```
User creates campaign with rules
        │
        ▼
ScannerService finds matching dormant contacts
        │
        ▼
Campaign job queued in Bull
        │
        ▼
For each contact:
    │
    ├──► ContextService gathers contact data
    │
    ├──► GeneratorService creates personalized message
    │
    ├──► (Optional) ReviewService queues for approval
    │
    ├──► EmailService/SmsService sends message
    │
    └──► HubspotLoggerService logs activity to timeline
        │
        ▼
OutreachRecord created with tracking data
```

### 3. Response Handling Flow

```
Webhook received (HubSpot/SendGrid/Twilio)
        │
        ▼
WebhookProcessor validates signature
        │
        ▼
Event type determined (open/click/reply/bounce)
        │
        ▼
ClassificationProcessor (for replies)
    │
    └──► AI classifies: interested | not_interested | unsubscribe | other
        │
        ▼
Response entity created
        │
        ▼
Analytics updated
```

### 4. Analytics Flow

```
Frontend requests dashboard data
        │
        ▼
AnalyticsModule aggregates:
    ├── Campaign performance
    ├── Channel metrics (email vs SMS)
    ├── A/B test results
    ├── Response classifications
    └── ROI calculations
        │
        ▼
Data returned to frontend
        │
        ▼
Recharts renders visualizations
```

---

## Multi-Tenancy

Each HubSpot portal is an isolated tenant:

- **Identifier**: `portalId` (from HubSpot)
- **Scoping**: All queries filtered by `accountId`
- **Auth**: `x-portal-id` header on all API requests
- **Data**: Separate tokens, rules, campaigns per account

---

## Security

| Concern              | Solution                                    |
|----------------------|---------------------------------------------|
| Token storage        | AES-256 encryption at rest                  |
| API authentication   | TokenValidationMiddleware                   |
| Webhook validation   | Signature verification (HMAC)               |
| Input sanitization   | class-validator + Zod                       |
| Secrets management   | Environment variables only                  |

---

## Background Jobs

| Queue              | Processor                  | Schedule/Trigger           |
|--------------------|----------------------------|----------------------------|
| dormancy-scan      | DormancyScanProcessor      | Cron (configurable)        |
| send-campaign      | SendCampaignProcessor      | On campaign start          |
| webhook-process    | WebhookProcessor           | On webhook received        |
| token-refresh      | TokenRefreshProcessor      | Before token expiry        |
| contact-sync       | ContactSyncProcessor       | Periodic sync              |
| classification     | ClassificationProcessor    | On reply received          |

---

## Development Workflow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Milestone  │────►│  Write Tests │────►│  Implement   │
│   Planning   │     │    First     │     │   Feature    │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
                                                  ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Update     │◄────│   All Tests  │◄────│   Refactor   │
│  Milestone   │     │    Pass      │     │    Code      │
└──────────────┘     └──────────────┘     └──────────────┘
```

**TDD is mandatory** - Tests written before implementation.

---

## Ports & URLs

| Service            | Development URL              |
|--------------------|------------------------------|
| Backend API        | http://localhost:3000        |
| Frontend           | http://localhost:5173        |
| PostgreSQL         | localhost:5432               |
| Redis              | localhost:6379               |
