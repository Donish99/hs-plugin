# B2B Dormant Lead Reactivation Plugin - Milestones Overview

## Project Summary
HubSpot-native plugin that automatically identifies dormant leads and re-engages them using AI-generated personalized email/SMS messages.

---

## Milestone Index

| # | Milestone | Status | Description |
|---|-----------|--------|-------------|
| 1 | [Foundation](./01-foundation.md) | Not Started | HubSpot OAuth, NestJS setup, database |
| 2 | [Dormancy Detection](./02-dormancy-detection.md) | Not Started | Criteria config, scanning, lead identification |
| 3 | [AI Integration](./03-ai-integration.md) | Not Started | Claude API, prompt engineering, message generation |
| 4 | [Sending Infrastructure](./04-sending-infrastructure.md) | Not Started | Email/SMS providers, HubSpot logging |
| 5 | [Response Handling](./05-response-handling.md) | Not Started | Webhooks, classification, auto-actions |
| 6 | [Analytics & Dashboard](./06-analytics-dashboard.md) | Not Started | Performance metrics, ROI tracking, settings UI |
| 7 | [Marketplace Launch](./07-marketplace-launch.md) | Not Started | Beta testing, documentation, listing |

---

## Tech Stack
- **Backend**: NestJS (TypeScript)
- **Database**: PostgreSQL 17
- **Cache/Queue**: Redis 7 + Bull
- **AI**: Claude API (Anthropic)
- **Email**: SendGrid (or HubSpot Transactional)
- **SMS**: Twilio
- **Hosting**: AWS/GCP
- **Testing**: Jest + Supertest (TDD approach)

---

## Development Methodology: TDD

This project follows **Test-Driven Development (TDD)**. Every feature must be developed using the Red-Green-Refactor cycle:

1. **Red**: Write a failing test first
2. **Green**: Write minimal code to pass the test
3. **Refactor**: Clean up while keeping tests green

### Testing Requirements per Milestone
- Each feature must have corresponding unit tests
- Integration tests for API endpoints
- E2E tests for critical flows
- Minimum 80% code coverage target
- All tests must pass before marking features complete

---

## Key Dependencies
- HubSpot Developer Account
- Anthropic API Key
- SendGrid API Key
- Twilio Account
- PostgreSQL Database
- Redis Instance
