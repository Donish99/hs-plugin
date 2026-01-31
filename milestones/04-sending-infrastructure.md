# Milestone 4: Sending Infrastructure

## Objective
Build the email and SMS sending capabilities with multiple provider options and HubSpot activity logging.

---

## Features

### 4.1 SendGrid Email Integration
**TDD Approach: Mock SendGrid API for all tests**
- [ ] Create SendGrid mock implementation
- [ ] Write tests for email service
  - [ ] Test successful email sending
  - [ ] Test tracking configuration
  - [ ] Test bounce/failure handling
  - [ ] Test retry logic
- [ ] Set up SendGrid SDK
- [ ] Create email service (make tests pass)
- [ ] Configure sender authentication (domain)
- [ ] Build email templates (HTML + text)
- [ ] Implement send with tracking:
  - Open tracking
  - Click tracking
  - Unique send ID
- [ ] Handle bounces and failures
- [ ] Implement retry logic

### 4.2 HubSpot Sequences Integration (Optional)
- [ ] Check customer's HubSpot plan (Pro+ required)
- [ ] Fetch available sequences
- [ ] Implement sequence enrollment API
- [ ] Map contacts to appropriate sequences
- [ ] Handle enrollment failures
- [ ] Track enrollment status

### 4.3 Twilio SMS Integration
**TDD Approach: Mock Twilio API for all tests**
- [ ] Create Twilio mock implementation
- [ ] Write tests for SMS service
  - [ ] Test consent verification logic
  - [ ] Test character limit handling
  - [ ] Test delivery status tracking
  - [ ] Test opt-out handling
- [ ] Set up Twilio SDK
- [ ] Create SMS service (make tests pass)
- [ ] Verify SMS consent before sending
- [ ] Implement character limit handling
- [ ] Track delivery status
- [ ] Handle opt-outs

### 4.4 HubSpot Activity Logging
- [ ] Log sent emails to HubSpot:
  - Create email engagement
  - Associate with contact
  - Include subject and body
  - Set correct timestamps
- [ ] Log SMS as communications
- [ ] Create follow-up tasks when appropriate
- [ ] Update contact properties (last contacted)

### 4.5 Campaign Executor Service
- [ ] Orchestrate multi-channel campaigns
- [ ] Respect sending limits:
  - Per account monthly limits
  - Daily sending caps
  - Rate limiting
- [ ] Handle scheduling:
  - Timezone awareness
  - Business hours only option
  - Spread sends over time
- [ ] Process campaign queue
- [ ] Update campaign stats in real-time

### 4.6 Delivery Status Tracking
- [ ] Track outreach record status:
  - Pending → Sent → Delivered → Opened → Clicked → Replied
  - Bounced / Failed states
- [ ] Store external message IDs
- [ ] Handle webhook updates from providers
- [ ] Update HubSpot engagement status

---

## Technical Details

### Email Send & Log Flow
```typescript
// 1. Send via SendGrid
const sendGridResponse = await sendGrid.send({
  to: contact.email,
  from: senderEmail,
  subject: message.subject,
  html: message.bodyHtml,
  trackingSettings: { clickTracking: { enable: true } }
});

// 2. Log to HubSpot
await hubspotClient.crm.objects.emails.create({
  properties: {
    hs_timestamp: new Date().toISOString(),
    hs_email_direction: 'EMAIL',
    hs_email_status: 'SENT',
    hs_email_subject: message.subject,
    hs_email_text: message.bodyText,
    hs_email_to_email: contact.email
  },
  associations: [...]
});
```

### SMS Consent Check
```typescript
// Only send if contact has SMS opt-in
if (!contact.smsOptIn) {
  return { skipped: true, reason: 'no_consent' };
}
```

### Key Files to Create
- `src/outreach/outreach.module.ts`
- `src/outreach/services/email.service.ts`
- `src/outreach/services/sms.service.ts`
- `src/outreach/services/hubspot-logger.service.ts`
- `src/outreach/services/campaign-executor.service.ts`
- `src/jobs/send-campaign.processor.ts`

---

## Acceptance Criteria
- [ ] Emails sent via SendGrid successfully
- [ ] SMS sent via Twilio with consent check
- [ ] All activities logged in HubSpot CRM
- [ ] Campaign execution respects rate limits
- [ ] Delivery status tracked for all messages
- [ ] Scheduled sending works correctly
- [ ] Monthly/daily limits enforced per account

## Testing Requirements (TDD)
- [ ] SendGrid mock implementation
- [ ] Twilio mock implementation
- [ ] Unit tests for email service (>80% coverage)
- [ ] Unit tests for SMS service (>80% coverage)
- [ ] Unit tests for campaign executor (>80% coverage)
- [ ] Unit tests for HubSpot logger service (>80% coverage)
- [ ] Integration tests for sending flow
- [ ] All tests passing before milestone complete
