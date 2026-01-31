# Milestone 5: Response Handling

## Objective
Set up webhook processing to detect responses and automatically take appropriate actions based on AI classification.

---

## Features

### 5.1 Webhook Subscription Setup
- [ ] Configure webhooks in HubSpot app settings
- [ ] Subscribe to relevant events:
  - `contact.propertyChange` (email opens, replies)
  - `deal.propertyChange` (stage changes)
  - `contact.associationChange`
- [ ] Set up webhook endpoint URL
- [ ] Implement signature validation (HMAC)

### 5.2 Webhook Handler Service
**TDD Approach: Test webhook validation and processing thoroughly**
- [ ] Write tests for webhook handler
  - [ ] Test signature validation (valid/invalid)
  - [ ] Test stale request rejection
  - [ ] Test batch payload handling
  - [ ] Test queueing behavior
- [ ] Create webhook receiver endpoint (make tests pass)
- [ ] Validate request signatures
- [ ] Reject stale requests (>5 min old)
- [ ] Queue events for async processing
- [ ] Return 200 response within 1 second
- [ ] Handle batch webhook payloads

### 5.3 Event Processing Pipeline
- [ ] Process events from queue
- [ ] Match events to outreach records
- [ ] Update tracking status:
  - Email opened → update `opened_at`
  - Email clicked → update `clicked_at`
  - Email replied → trigger classification
- [ ] Handle deal stage changes
- [ ] Log all events for debugging

### 5.4 Response Classification (AI)
**TDD Approach: Test classification logic with varied response examples**
- [ ] Write tests for classifier service
  - [ ] Test each classification category
  - [ ] Test edge cases and ambiguous responses
  - [ ] Test confidence score calculation
  - [ ] Test error handling for failed classifications
- [ ] Detect incoming replies
- [ ] Fetch reply content from HubSpot
- [ ] Classify response using Claude (make tests pass):
  - **Interested**: Wants to continue conversation
  - **Not now**: Timing not right, follow up later
  - **Not interested**: Polite decline
  - **Unsubscribe**: Remove from outreach
  - **Out of office**: Reschedule
  - **Bounced**: Invalid contact
- [ ] Store classification with confidence score

### 5.5 Automated Actions
- [ ] Based on classification, execute actions:

| Classification | Action |
|----------------|--------|
| Interested | Create task for sales rep, pause sequence |
| Not now | Schedule follow-up in X days |
| Not interested | Stop campaign, mark contact |
| Unsubscribe | Remove from all campaigns, update HubSpot |
| Out of office | Reschedule based on return date |
| Bounced | Mark email invalid in HubSpot |

- [ ] Create HubSpot tasks automatically
- [ ] Update campaign status
- [ ] Notify sales rep (optional)

### 5.6 Campaign Pause/Stop Logic
- [ ] Auto-pause on positive response
- [ ] Stop sequence on explicit opt-out
- [ ] Prevent re-enrollment for X days
- [ ] Global suppression list
- [ ] Handle manual pause/resume

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

### Key Files to Create
- `src/hubspot/services/webhooks.service.ts`
- `src/hubspot/controllers/webhooks.controller.ts`
- `src/ai/services/classifier.service.ts`
- `src/campaigns/services/actions.service.ts`
- `src/jobs/webhook-processor.ts`
- `src/jobs/classification.processor.ts`

---

## Acceptance Criteria
- [ ] Webhooks received and validated
- [ ] Events processed asynchronously
- [ ] Email opens/clicks tracked in database
- [ ] Replies classified accurately
- [ ] Automated actions triggered correctly
- [ ] Tasks created in HubSpot for sales
- [ ] Campaigns pause/stop as expected
- [ ] Suppression list respected

## Testing Requirements (TDD)
- [ ] Unit tests for webhook handler (>80% coverage)
- [ ] Unit tests for classifier service (>80% coverage)
- [ ] Unit tests for actions service (>80% coverage)
- [ ] Test fixtures for various webhook payloads
- [ ] Test fixtures for response classification samples
- [ ] E2E test for webhook → classification → action flow
- [ ] All tests passing before milestone complete
