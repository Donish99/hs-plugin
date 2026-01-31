# Milestone 2: Dormancy Detection

## Objective
Build the system to identify dormant leads based on configurable criteria and surface them for reactivation.

---

## Features

### 2.1 Dormancy Criteria Configuration
**TDD Approach: Write tests before implementing each feature**
- [x] Define dormancy criteria schema:
  - Minimum days inactive
  - No email opens in X days
  - No email clicks in X days
  - No website visits in X days
  - Specific deal stages (stalled)
  - Minimum lead score threshold
  - Exclusion tags/lists
- [x] Write tests for dormancy rules service
  - [x] Test CRUD operations
  - [x] Test validation logic
  - [x] Test multi-tenant isolation
- [x] Create CRUD API for dormancy rules (make tests pass)
- [x] Support multiple rules per account
- [x] Rule activation/deactivation toggle

### 2.2 Contact Search & Filtering
- [x] Build HubSpot search query builder
- [x] Implement filter combinations:
  - `notes_last_contacted` older than X
  - `hs_email_last_open_date` older than X
  - `hs_email_last_click_date` older than X
  - `hs_analytics_last_visit_timestamp` older than X
  - Deal stage filters
- [x] Handle pagination for large result sets
- [x] Implement caching for repeated queries

### 2.3 Scheduled Dormancy Scanner
- [x] Create cron job for daily scanning
- [x] Process each account's dormancy rules
- [x] Batch contacts matching criteria
- [x] Create campaign records for matched contacts
- [x] Implement incremental scanning (delta)
- [x] Add scan status logging

### 2.4 Dormancy Detection Service
**TDD Approach: Test scoring algorithms thoroughly**
- [x] Write tests for dormancy analysis engine
  - [x] Test dormancy score calculation
  - [x] Test prioritization algorithms
  - [x] Test edge cases (missing data, zero values)
- [x] Build dormancy analysis engine (make tests pass)
- [x] Calculate dormancy score per contact
- [x] Prioritize leads by:
  - Deal value
  - Lead score
  - Recency of last engagement
  - Company size/tier
- [x] Generate dormancy report per scan

### 2.5 Dashboard - Dormant Leads View
- [x] API endpoint: list dormant contacts
- [x] Filter by dormancy rule
- [x] Sort by priority/score
- [x] Contact detail view with history
- [x] Bulk selection for campaigns
- [x] Export to CSV option

---

## Technical Details

### Key HubSpot Properties to Query
| Property | Description |
|----------|-------------|
| `notes_last_contacted` | Last sales contact date |
| `hs_email_last_open_date` | Last email open |
| `hs_email_last_click_date` | Last email click |
| `hs_analytics_last_visit_timestamp` | Last website visit |
| `hs_sales_email_last_replied` | Last email reply |
| `num_contacted_notes` | Total contact attempts |

### Dormancy Rule Schema Example
```json
{
  "min_days_inactive": 30,
  "no_email_opens_days": 14,
  "deal_stages": ["qualifiedtobuy", "presentationscheduled"],
  "exclude_tags": ["vip", "do-not-contact"],
  "min_lead_score": 50
}
```

### Key Files to Create
- `src/campaigns/services/dormancy.service.ts`
- `src/campaigns/services/scanner.service.ts`
- `src/campaigns/controllers/rules.controller.ts`
- `src/campaigns/controllers/dormant-leads.controller.ts`
- `src/jobs/dormancy-scan.processor.ts`

---

## Acceptance Criteria
- [x] Can create/edit/delete dormancy rules
- [x] Scanner runs on schedule and finds dormant contacts
- [x] Contacts correctly matched against rule criteria
- [x] Dormant leads visible in dashboard
- [x] Prioritization/scoring working
- [x] Scan logs available for debugging

## Testing Requirements (TDD)
- [x] Unit tests for dormancy rules service (>80% coverage) - 21 tests
- [x] Unit tests for query builder service (>80% coverage) - 19 tests
- [x] Unit tests for scanner service (>80% coverage) - 12 tests
- [x] Unit tests for dormancy scan processor (>80% coverage) - 15 tests
- [x] Unit tests for dormancy scan scheduler (>80% coverage) - 11 tests
- [x] Unit tests for dormancy detection/scoring (>80% coverage) - 30 tests
- [x] Unit tests for campaign service (>80% coverage) - 21 tests
- [x] Unit tests for dormant leads controller (>80% coverage) - 19 tests
- [x] Integration tests for rules API endpoints - 18 tests (test/rules.e2e-spec.ts)
- [x] Mock HubSpot search responses for testing
- [x] All tests passing before milestone complete (305 unit + 18 integration = 323 total tests)
