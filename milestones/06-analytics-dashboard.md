# Milestone 6: Analytics & Dashboard

## Objective
Build comprehensive analytics, performance dashboards, and settings management for users.

---

## Features

### 6.1 Campaign Performance Dashboard
- [ ] Campaign list view with stats:
  - Total contacts
  - Emails sent
  - Open rate
  - Click rate
  - Reply rate
  - Meetings booked
- [ ] Individual campaign detail view
- [ ] Time-series charts (daily/weekly)
- [ ] Compare campaigns performance
- [ ] Filter by date range

### 6.2 Engagement Metrics
**TDD Approach: Test metric calculations thoroughly**
- [ ] Write tests for metrics service
  - [ ] Test rate calculations (open rate, click rate, etc.)
  - [ ] Test edge cases (division by zero, empty data)
  - [ ] Test trend calculations
  - [ ] Test aggregation logic
- [ ] Track and display (make tests pass):
  - Sent count
  - Delivered count
  - Bounced count
  - Opened count
  - Clicked count
  - Replied count
  - Positive responses
  - Meetings scheduled
- [ ] Calculate rates and percentages
- [ ] Benchmark against industry averages
- [ ] Trend analysis over time

### 6.3 ROI Tracking
**TDD Approach: Test ROI calculations with sample data**
- [ ] Write tests for ROI service
  - [ ] Test deal attribution logic
  - [ ] Test pipeline value calculations
  - [ ] Test cost per reactivation formula
  - [ ] Test edge cases (no deals, missing data)
- [ ] Link reactivated contacts to deals (make tests pass)
- [ ] Track deal stage progression
- [ ] Calculate influenced pipeline:
  - Deals reopened
  - Deals advanced
  - Deals closed-won
- [ ] Revenue attributed to plugin
- [ ] Cost per reactivation

### 6.4 A/B Test Results
- [ ] Compare variant performance:
  - Which subject lines work best
  - Which tones perform better
  - Optimal send times
- [ ] Statistical significance indicators
- [ ] Winning variant recommendations
- [ ] Apply learnings to future campaigns

### 6.5 Settings & Configuration UI
- [ ] Account settings:
  - Default sender email
  - Business hours
  - Timezone
- [ ] Integration settings:
  - SendGrid API key
  - Twilio credentials
  - Reconnect HubSpot
- [ ] Sending limits:
  - Monthly cap
  - Daily cap
  - Emails per hour
- [ ] AI settings:
  - Tone preference
  - Auto-approve threshold
  - Review required flag
- [ ] Notification preferences

### 6.6 Error Handling & Monitoring
- [ ] Error logging dashboard
- [ ] Failed sends report
- [ ] API rate limit warnings
- [ ] Token refresh failures alert
- [ ] Sync status monitor
- [ ] Health check endpoint

### 6.7 Activity Log
- [ ] Searchable activity log
- [ ] Filter by:
  - Event type
  - Contact
  - Campaign
  - Date range
- [ ] Export activity data
- [ ] Retention policy (90 days)

---

## Technical Details

### Dashboard Metrics Query
```sql
SELECT
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE status = 'sent') as sent,
  COUNT(*) FILTER (WHERE opened_at IS NOT NULL) as opened,
  COUNT(*) FILTER (WHERE clicked_at IS NOT NULL) as clicked,
  COUNT(*) FILTER (WHERE replied_at IS NOT NULL) as replied,
  ROUND(COUNT(*) FILTER (WHERE opened_at IS NOT NULL)::numeric /
        NULLIF(COUNT(*) FILTER (WHERE status = 'sent'), 0) * 100, 2) as open_rate
FROM outreach_records
WHERE campaign_id = $1;
```

### ROI Calculation
```typescript
interface ROIMetrics {
  totalCost: number;           // AI + sending costs
  dealsInfluenced: number;     // Deals touched by reactivation
  pipelineValue: number;       // Total deal value influenced
  closedWonValue: number;      // Revenue from closed deals
  roi: number;                 // (closedWonValue - totalCost) / totalCost
}
```

### Key Files to Create
- `src/analytics/analytics.module.ts`
- `src/analytics/services/metrics.service.ts`
- `src/analytics/services/roi.service.ts`
- `src/analytics/controllers/dashboard.controller.ts`
- `src/settings/settings.module.ts`
- `src/settings/services/settings.service.ts`
- `src/settings/controllers/settings.controller.ts`

### Frontend Pages (if building UI)
- `/dashboard` - Main analytics view
- `/campaigns` - Campaign list
- `/campaigns/:id` - Campaign detail
- `/settings` - Account settings
- `/settings/integrations` - API keys
- `/activity` - Activity log

---

## Acceptance Criteria
- [ ] Dashboard displays accurate metrics
- [ ] Charts render time-series data
- [ ] ROI tracking shows influenced deals
- [ ] A/B test results visible
- [ ] Settings can be updated and saved
- [ ] Errors logged and viewable
- [ ] Activity log searchable
- [ ] Export functionality works

## Testing Requirements (TDD)
- [ ] Unit tests for metrics service (>80% coverage)
- [ ] Unit tests for ROI service (>80% coverage)
- [ ] Unit tests for settings service (>80% coverage)
- [ ] Integration tests for dashboard API endpoints
- [ ] Test fixtures for analytics data
- [ ] All tests passing before milestone complete
