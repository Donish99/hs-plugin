# Claude Code Configuration - HubSpot Dormant Lead Reactivation Plugin

## Project Overview
Building a HubSpot-native plugin that identifies dormant leads and re-engages them using AI-generated personalized email/SMS messages.

## Project Structure (Monorepo)
```
/hs/
├── apps/
│   ├── backend/           # NestJS API (@hsdl/backend)
│   ├── frontend/          # React + Vite (@hsdl/frontend)
│   └── hubspot-extensions/ # HubSpot UI extensions (@hsdl/hubspot-extensions)
├── packages/
│   └── shared-types/      # Shared TypeScript types (@hsdl/shared-types)
├── package.json           # Root workspace package.json
├── pnpm-workspace.yaml    # Workspace configuration
├── tsconfig.base.json     # Base TypeScript config
├── .eslintrc.js           # Root ESLint config
├── .prettierrc
├── CLAUDE.md
└── milestones/
```

## Key Documents
- **Master Plan**: `/Users/akhmadullonurmakhamatov/Desktop/hs/plan.md`
- **Milestones**: `/Users/akhmadullonurmakhamatov/Desktop/hs/milestones/`

## Tech Stack
- **Backend**: NestJS (TypeScript) - `apps/backend/`
- **Frontend**: React + Vite + TailwindCSS - `apps/frontend/`
- **HubSpot Extensions**: React + HubSpot UI Extensions SDK - `apps/hubspot-extensions/`
- **Database**: PostgreSQL 17 with TypeORM
- **Cache/Queue**: Redis 7 + Bull
- **AI**: OpenAI API (GPT-4o)
- **Email**: SendGrid
- **SMS**: Twilio
- **CRM**: HubSpot API

---

## Development Rules

### 1. Test-Driven Development (TDD) - MANDATORY
- **Write tests FIRST before implementing any feature**
- Follow the Red-Green-Refactor cycle:
  1. **Red**: Write a failing test that defines expected behavior
  2. **Green**: Write minimal code to make the test pass
  3. **Refactor**: Clean up code while keeping tests green
- Test coverage requirements:
  - Unit tests for all services and utilities (>80% coverage)
  - Integration tests for API endpoints
  - E2E tests for critical user flows
- Test file naming: `*.spec.ts` for unit tests, `*.e2e-spec.ts` for E2E tests
- Use mocks for external services (HubSpot, OpenAI, SendGrid, Twilio)
- Run tests before committing: `pnpm test`
- All tests must pass before marking a feature complete

### 2. Milestone Tracking
- Always check current milestone status before starting work
- Update milestone checkboxes when completing features
- Reference milestone file when implementing features
- Mark tasks complete only when fully tested
- **Each milestone section must have associated test coverage**

### 3. Code Standards
- Use TypeScript strict mode
- Follow NestJS conventions (modules, services, controllers)
- Use dependency injection
- Write interfaces for all data structures
- Add JSDoc comments for public methods
- Use shared types from `@hsdl/shared-types` when applicable

### 4. HubSpot Integration
- Always validate OAuth tokens before API calls
- Implement token refresh logic
- Respect rate limits (100 requests/10 seconds)
- Log all HubSpot API interactions
- Use HubSpot SDK (`@hubspot/api-client`) when possible

### 5. Database
- Create migrations for all schema changes
- Never modify migrations after they've run
- Use transactions for multi-table operations
- Encrypt sensitive data (tokens, API keys)

### 6. Security
- Never log sensitive tokens or credentials
- Validate webhook signatures
- Sanitize all user inputs
- Use environment variables for secrets

### 7. AI Integration
- Track token usage per account
- Implement retry logic for API failures
- Cache generated content when appropriate
- Log prompts and responses for debugging

---

## Backend File Structure
```
apps/backend/src/
├── app.module.ts
├── main.ts
├── config/
│   ├── database.config.ts
│   ├── redis.config.ts
│   └── hubspot.config.ts
├── hubspot/
│   ├── hubspot.module.ts
│   ├── services/
│   │   ├── oauth.service.ts
│   │   ├── oauth.service.spec.ts
│   │   ├── contacts.service.ts
│   │   └── contacts.service.spec.ts
│   └── controllers/
│       ├── oauth.controller.ts
│       └── oauth.controller.spec.ts
├── campaigns/
│   ├── campaigns.module.ts
│   ├── services/
│   │   ├── dormancy-rules.service.ts
│   │   ├── scanner.service.ts
│   │   └── dormancy-detection.service.ts
│   └── controllers/
├── ai/
│   ├── ai.module.ts
│   ├── services/
│   │   ├── generator.service.ts
│   │   ├── context.service.ts
│   │   ├── prompt.service.ts
│   │   └── review.service.ts
│   └── controllers/
├── outreach/
│   ├── outreach.module.ts
│   ├── services/
│   │   ├── email.service.ts
│   │   ├── sms.service.ts
│   │   └── campaign-executor.service.ts
│   └── controllers/
├── jobs/
│   ├── dormancy-scan.processor.ts
│   ├── send-campaign.processor.ts
│   └── contact-sync.processor.ts
├── entities/
│   ├── hubspot-account.entity.ts
│   ├── dormancy-rule.entity.ts
│   ├── campaign.entity.ts
│   ├── outreach-record.entity.ts
│   ├── message-variant.entity.ts
│   └── review-queue.entity.ts
└── test/
    ├── mocks/
    ├── fixtures/
    └── helpers/
```

---

## Common Commands

### Root (Monorepo) Commands
```bash
# Install all dependencies
pnpm install

# Run all apps in development
pnpm dev

# Run specific apps
pnpm dev:backend        # Start NestJS on port 3000
pnpm dev:frontend       # Start Vite on port 5173

# Build all packages
pnpm build

# Run all tests
pnpm test

# Lint all packages
pnpm lint

# Clean all node_modules and dist
pnpm clean
```

### Backend Commands (from apps/backend/)
```bash
# Start development
pnpm start:dev

# Run migrations
pnpm migration:run

# Generate migration
pnpm migration:generate -- -n MigrationName

# TDD Commands
pnpm test              # Run all unit tests
pnpm test:watch        # Run tests in watch mode
pnpm test:cov          # Run tests with coverage
pnpm test:e2e          # Run end-to-end tests
```

### Frontend Commands (from apps/frontend/)
```bash
pnpm dev               # Start Vite dev server
pnpm build             # Build for production
pnpm test              # Run Vitest tests
pnpm test:coverage     # Run tests with coverage
```

### HubSpot Extensions Commands (from apps/hubspot-extensions/)
```bash
pnpm start             # Start HubSpot project dev
pnpm upload            # Upload to HubSpot
```

---

## Environment Variables Required

### Backend (.env in apps/backend/)
```
HUBSPOT_CLIENT_ID
HUBSPOT_CLIENT_SECRET
HUBSPOT_APP_ID
DATABASE_URL
REDIS_URL
OPENAI_API_KEY
SENDGRID_API_KEY
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_PHONE
ENCRYPTION_KEY
APP_URL
```

### Frontend (.env in apps/frontend/)
```
VITE_API_URL=http://localhost:3000
```

---

## Milestone Progress Tracking

When completing work, update the relevant milestone file:
1. Check off completed items with `[x]`
2. Add notes if implementation differs from plan
3. Update acceptance criteria status

Current milestone files:
- `milestones/01-foundation.md` - OAuth, database, basic setup
- `milestones/02-dormancy-detection.md` - Lead identification
- `milestones/03-ai-integration.md` - OpenAI API, message generation
- `milestones/04-sending-infrastructure.md` - Email/SMS sending
- `milestones/05-response-handling.md` - Webhooks, classification
- `milestones/06-analytics-dashboard.md` - Metrics, settings
- `milestones/07-marketplace-launch.md` - Beta, documentation, launch
