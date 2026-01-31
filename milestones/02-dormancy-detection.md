# Milestone 2: Dormancy Detection

## Objective
Build the system to identify dormant leads based on configurable criteria and surface them for reactivation.

---

## Features

### 2.1 Dormancy Criteria Configuration
**TDD Approach: Write tests before implementing each feature**
- [ ] Define dormancy criteria schema:
  - Minimum days inactive
  - No email opens in X days
  - No email clicks in X days
  - No website visits in X days
  - Specific deal stages (stalled)
  - Minimum lead score threshold
  - Exclusion tags/lists
- [ ] Write tests for dormancy rules service
  - [ ] Test CRUD operations
  - [ ] Test validation logic
  - [ ] Test multi-tenant isolation
- [ ] Create CRUD API for dormancy rules (make tests pass)
- [ ] Support multiple rules per account
- [ ] Rule activation/deactivation toggle

### 2.2 Contact Search & Filtering
- [ ] Build HubSpot search query builder
- [ ] Implement filter combinations:
  - `notes_last_contacted` older than X
  - `hs_email_last_open_date` older than X
  - `hs_email_last_click_date` older than X
  - `hs_analytics_last_visit_timestamp` older than X
  - Deal stage filters
- [ ] Handle pagination for large result sets
- [ ] Implement caching for repeated queries

### 2.3 Scheduled Dormancy Scanner
- [ ] Create cron job for daily scanning
- [ ] Process each account's dormancy rules
- [ ] Batch contacts matching criteria
- [ ] Create campaign records for matched contacts
- [ ] Implement incremental scanning (delta)
- [ ] Add scan status logging

### 2.4 Dormancy Detection Service
**TDD Approach: Test scoring algorithms thoroughly**
- [ ] Write tests for dormancy analysis engine
  - [ ] Test dormancy score calculation
  - [ ] Test prioritization algorithms
  - [ ] Test edge cases (missing data, zero values)
- [ ] Build dormancy analysis engine (make tests pass)
- [ ] Calculate dormancy score per contact
- [ ] Prioritize leads by:
  - Deal value
  - Lead score
  - Recency of last engagement
  - Company size/tier
- [ ] Generate dormancy report per scan

### 2.5 Dashboard - Dormant Leads View
- [ ] API endpoint: list dormant contacts
- [ ] Filter by dormancy rule
- [ ] Sort by priority/score
- [ ] Contact detail view with history
- [ ] Bulk selection for campaigns
- [ ] Export to CSV option

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
- [ ] Can create/edit/delete dormancy rules
- [ ] Scanner runs on schedule and finds dormant contacts
- [ ] Contacts correctly matched against rule criteria
- [ ] Dormant leads visible in dashboard
- [ ] Prioritization/scoring working
- [ ] Scan logs available for debugging

## Testing Requirements (TDD)
- [ ] Unit tests for dormancy rules service (>80% coverage)
- [ ] Unit tests for scanner service (>80% coverage)
- [ ] Unit tests for dormancy detection/scoring (>80% coverage)
- [ ] Integration tests for rules API endpoints
- [ ] Mock HubSpot search responses for testing
- [ ] All tests passing before milestone complete
