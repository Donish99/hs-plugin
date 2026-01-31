# Milestone 5: Response Handling

## Objective
Set up webhook processing to detect responses and automatically take appropriate actions based on AI classification.

---

## Features

### 5.1 Webhook Subscription Setup
- [x] Configure webhooks in HubSpot app settings
- [x] Subscribe to relevant events:
  - `contact.propertyChange` (email opens, replies)
  - `deal.propertyChange` (stage changes)
  - `contact.associationChange`
- [x] Set up webhook endpoint URL
- [x] Implement signature validation (HMAC)

### 5.2 Webhook Handler Service
**TDD Approach: Test webhook validation and processing thoroughly**
- [x] Write tests for webhook handler
  - [x] Test signature validation (valid/invalid)
  - [x] Test stale request rejection
  - [x] Test batch payload handling
  - [x] Test queueing behavior
- [x] Create webhook receiver endpoint (make tests pass)
- [x] Validate request signatures
- [x] Reject stale requests (>5 min old)
- [x] Queue events for async processing
- [x] Return 200 response within 1 second
- [x] Handle batch webhook payloads

### 5.3 Event Processing Pipeline
- [x] Process events from queue
- [x] Match events to outreach records
- [x] Update tracking status:
  - Email opened → update `opened_at`
  - Email clicked → update `clicked_at`
  - Email replied → trigger classification
- [x] Handle deal stage changes
- [x] Log all events for debugging

### 5.4 Response Classification (AI)
**TDD Approach: Test classification logic with varied response examples**
- [x] Write tests for classifier service
  - [x] Test each classification category
  - [x] Test edge cases and ambiguous responses
  - [x] Test confidence score calculation
  - [x] Test error handling for failed classifications
- [x] Detect incoming replies
- [x] Fetch reply content from HubSpot
- [x] Classify response using OpenAI (make tests pass):
  - **Interested**: Wants to continue conversation
  - **Not now**: Timing not right, follow up later
  - **Not interested**: Polite decline
  - **Unsubscribe**: Remove from outreach
  - **Out of office**: Reschedule
  - **Bounced**: Invalid contact
- [x] Store classification with confidence score

### 5.5 Automated Actions
- [x] Based on classification, execute actions:

| Classification | Action |
|----------------|--------|
| Interested | Create task for sales rep, pause sequence |
| Not now | Schedule follow-up in X days |
| Not interested | Stop campaign, mark contact |
| Unsubscribe | Remove from all campaigns, update HubSpot |
| Out of office | Reschedule based on return date |
| Bounced | Mark email invalid in HubSpot |

- [x] Create HubSpot tasks automatically
- [x] Update campaign status
- [x] Notify sales rep (optional)

### 5.6 Campaign Pause/Stop Logic
- [x] Auto-pause on positive response
- [x] Stop sequence on explicit opt-out
- [x] Prevent re-enrollment for X days
- [x] Global suppression list
- [x] Handle manual pause/resume

---

## Technical Details

### Webhook Signature Validation
```typescript
async validateWebhook(req: Request): Promise<boolean> {
  const signature = req.headers['x-hubspot-signature-v3'];
  const timestamp = req.headers['x-hubspot-request-timestamp'];
  const body = req.rawBody;

  if (Date.now() - parseInt(timestamp) > 300000) {
    return false; // Reject if > 5 minutes old
  }

  const sourceString = `${req.method}${req.url}${body}${timestamp}`;
  const expectedSignature = crypto
    .createHmac('sha256', CLIENT_SECRET)
    .update(sourceString)
    .digest('base64');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

### Classification Prompt
```
Classify this email reply into one of these categories:
- INTERESTED: Wants to learn more or schedule a call
- NOT_NOW: Timing isn't right but may be interested later
- NOT_INTERESTED: Polite decline, doesn't want to proceed
- UNSUBSCRIBE: Wants to be removed from emails
- OUT_OF_OFFICE: Automated away message
- BOUNCED: Delivery failure notification

Reply: {email_content}

Respond with JSON: { "classification": "...", "confidence": 0.0-1.0, "reason": "..." }
```

### Key Files Created
- `src/hubspot/services/webhooks.service.ts`
- `src/hubspot/controllers/webhooks.controller.ts`
- `src/ai/services/classifier.service.ts`
- `src/campaigns/services/actions.service.ts`
- `src/jobs/webhook.processor.ts`
- `src/jobs/classification.processor.ts`

---

## Acceptance Criteria
- [x] Webhooks received and validated
- [x] Events processed asynchronously
- [x] Email opens/clicks tracked in database
- [x] Replies classified accurately
- [x] Automated actions triggered correctly
- [x] Tasks created in HubSpot for sales
- [x] Campaigns pause/stop as expected
- [x] Suppression list respected

## Testing Requirements (TDD)
- [x] Unit tests for webhook handler (>80% coverage)
- [x] Unit tests for classifier service (>80% coverage)
- [x] Unit tests for actions service (>80% coverage)
- [x] Test fixtures for various webhook payloads
- [x] Test fixtures for response classification samples
- [x] E2E test for webhook → classification → action flow
- [x] All tests passing before milestone complete

## Implementation Notes
- Added `scheduledAt` column to outreach_records for follow-up scheduling
- Added `pauseCampaign` and `stopCampaign` methods to CampaignService
- ClassificationProcessor integrates with ClassifierService and ActionsService
- WebhookProcessor handles email open/click/reply/bounce events
- Migration created: `1706700000001-AddScheduledAtToOutreach.ts`
