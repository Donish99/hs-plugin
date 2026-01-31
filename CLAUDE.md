# Claude Code Configuration - HubSpot Dormant Lead Reactivation Plugin

## Project Overview
Building a HubSpot-native plugin that identifies dormant leads and re-engages them using AI-generated personalized email/SMS messages.

## Key Documents
- **Master Plan**: `/Users/akhmadullonurmakhamatov/Desktop/hs/plan.md`
- **Milestones**: `/Users/akhmadullonurmakhamatov/Desktop/hs/milestones/`

## Tech Stack
- **Backend**: NestJS (TypeScript)
- **Database**: PostgreSQL with TypeORM
- **Cache/Queue**: Redis + Bull
- **AI**: Claude API (Anthropic)
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
- Use mocks for external services (HubSpot, Claude, SendGrid, Twilio)
- Run tests before committing: `npm run test`
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

## File Structure (Target)
```
src/
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
│   │   ├── oauth.service.spec.ts        # Unit tests
│   │   ├── contacts.service.ts
│   │   ├── contacts.service.spec.ts     # Unit tests
│   │   ├── webhooks.service.ts
│   │   └── webhooks.service.spec.ts     # Unit tests
│   └── controllers/
│       ├── oauth.controller.ts
│       ├── oauth.controller.spec.ts     # Unit tests
│       ├── webhooks.controller.ts
│       └── webhooks.controller.spec.ts  # Unit tests
├── campaigns/
│   ├── campaigns.module.ts
│   ├── services/
│   │   ├── dormancy.service.ts
│   │   ├── dormancy.service.spec.ts
│   │   ├── scanner.service.ts
│   │   ├── scanner.service.spec.ts
│   │   ├── campaign.service.ts
│   │   └── campaign.service.spec.ts
│   └── controllers/
├── ai/
│   ├── ai.module.ts
│   ├── services/
│   │   ├── generator.service.ts
│   │   ├── generator.service.spec.ts
│   │   ├── classifier.service.ts
│   │   ├── classifier.service.spec.ts
│   │   ├── context.service.ts
│   │   └── context.service.spec.ts
│   └── templates/
├── outreach/
│   ├── outreach.module.ts
│   ├── services/
│   │   ├── email.service.ts
│   │   ├── email.service.spec.ts
│   │   ├── sms.service.ts
│   │   ├── sms.service.spec.ts
│   │   ├── hubspot-logger.service.ts
│   │   └── hubspot-logger.service.spec.ts
│   └── controllers/
├── analytics/
│   ├── analytics.module.ts
│   └── services/
├── jobs/
│   ├── dormancy-scan.processor.ts
│   ├── dormancy-scan.processor.spec.ts
│   ├── send-campaign.processor.ts
│   ├── send-campaign.processor.spec.ts
│   ├── webhook-processor.ts
│   └── webhook-processor.spec.ts
├── entities/
│   ├── hubspot-account.entity.ts
│   ├── dormancy-rule.entity.ts
│   ├── campaign.entity.ts
│   ├── outreach-record.entity.ts
│   └── response.entity.ts
└── test/
    ├── mocks/                           # Shared mocks
    │   ├── hubspot.mock.ts
    │   ├── claude.mock.ts
    │   ├── sendgrid.mock.ts
    │   └── twilio.mock.ts
    ├── fixtures/                        # Test data
    │   ├── contacts.fixture.ts
    │   ├── campaigns.fixture.ts
    │   └── accounts.fixture.ts
    └── helpers/                         # Test utilities
        └── test-utils.ts

test/                                    # E2E tests
├── app.e2e-spec.ts
├── oauth.e2e-spec.ts
├── campaigns.e2e-spec.ts
└── webhooks.e2e-spec.ts
```

---

## Common Commands
```bash
# Start development
pnpm start:dev

# Run migrations
pnpm migration:run

# Generate migration
pnpm migration:generate -- -n MigrationName

# TDD Commands
pnpm test              # Run all unit tests
pnpm test:watch        # Run tests in watch mode (TDD mode)
pnpm test:cov          # Run tests with coverage report
pnpm test:e2e          # Run end-to-end tests
pnpm test:debug        # Debug tests

# Lint
pnpm lint

# Install dependencies
pnpm install
```

---

## Environment Variables Required
```
HUBSPOT_CLIENT_ID
HUBSPOT_CLIENT_SECRET
HUBSPOT_APP_ID
DATABASE_URL
REDIS_URL
ANTHROPIC_API_KEY
SENDGRID_API_KEY
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_PHONE
ENCRYPTION_KEY
APP_URL
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
- `milestones/03-ai-integration.md` - Claude API, message generation
- `milestones/04-sending-infrastructure.md` - Email/SMS sending
- `milestones/05-response-handling.md` - Webhooks, classification
- `milestones/06-analytics-dashboard.md` - Metrics, settings
- `milestones/07-marketplace-launch.md` - Beta, documentation, launch
