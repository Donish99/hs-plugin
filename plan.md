# B2B Dormant Lead Reactivation Plugin for HubSpot
## Complete Architecture & Technical Specification

---

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [HubSpot Integration Overview](#hubspot-integration-overview)
3. [System Architecture](#system-architecture)
4. [HubSpot APIs Deep Dive](#hubspot-apis-deep-dive)
5. [Data Flow & Processing](#data-flow--processing)
6. [Email/SMS Sending Strategy](#emailsms-sending-strategy)
7. [AI Content Generation](#ai-content-generation)
8. [Database Schema](#database-schema)
9. [Authentication & Security](#authentication--security)
10. [Deployment Architecture](#deployment-architecture)
11. [HubSpot Marketplace Requirements](#hubspot-marketplace-requirements)
12. [Development Phases](#development-phases)

---

## Executive Summary

### What We're Building
A HubSpot-native plugin that automatically identifies dormant leads (contacts/deals with no engagement for a configurable period) and re-engages them using AI-generated personalized email/SMS messages.

### Core Value Proposition
- **For Sales Teams**: Revive forgotten leads without manual effort
- **For Companies**: Extract value from leads they already paid to acquire
- **Differentiation**: Native HubSpot integration (not a standalone platform)

---

## HubSpot Integration Overview

### App Type: Public OAuth App

We'll build a **Public OAuth App** because:
- Can be installed by multiple HubSpot customers
- Listed on HubSpot App Marketplace for distribution
- Uses OAuth 2.0 (secure, no credential sharing)
- Enables webhooks for real-time updates
- Supports UI extensions inside HubSpot

### Distribution Limits (Important!)
| Stage | Install Limit |
|-------|---------------|
| Development (pre-AUP) | 10 developer test accounts |
| After signing AUP | 25 installs |
| After Marketplace listing | Unlimited |

> **Note**: Need 3 active installs to apply for Marketplace review.

### Required HubSpot Plans (Customer Side)
Your plugin can work with different tiers, but some features require specific plans:

| Feature | Required HubSpot Plan |
|---------|----------------------|
| Basic CRM access | Free CRM |
| Sequences enrollment via API | Sales Hub Professional+ |
| Transactional Email API | Marketing Hub + Transactional Add-on |
| Workflow webhook actions | Operations Hub Professional+ |
| Custom objects | Enterprise |

---

## System Architecture

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              HubSpot CRM                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │ Contacts │  │  Deals   │  │Companies │  │Engagements│ │ Sequences│      │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘      │
│       │             │             │             │             │             │
│       └─────────────┴─────────────┴─────────────┴─────────────┘             │
│                                   │                                          │
│                          HubSpot APIs (REST)                                 │
│                          + Webhooks (Push)                                   │
└───────────────────────────────────┬──────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
            ┌───────▼───────┐       │       ┌───────▼───────┐
            │   Webhooks    │       │       │   Polling     │
            │  (Real-time)  │       │       │  (Scheduled)  │
            └───────┬───────┘       │       └───────┬───────┘
                    │               │               │
                    └───────────────┼───────────────┘
                                    │
┌───────────────────────────────────▼──────────────────────────────────────────┐
│                         YOUR BACKEND (NestJS)                                 │
│                                                                               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐              │
│  │  OAuth Service  │  │ Webhook Handler │  │  Job Scheduler  │              │
│  │  (Token Mgmt)   │  │  (Event Queue)  │  │   (Bull/Redis)  │              │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘              │
│           │                    │                    │                        │
│           └────────────────────┼────────────────────┘                        │
│                                │                                              │
│  ┌─────────────────────────────▼─────────────────────────────────┐           │
│  │                    Core Processing Engine                      │           │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │           │
│  │  │  Dormancy   │  │    AI       │  │  Campaign   │            │           │
│  │  │  Detector   │──│  Generator  │──│  Executor   │            │           │
│  │  │  Service    │  │  Service    │  │  Service    │            │           │
│  │  └─────────────┘  └─────────────┘  └─────────────┘            │           │
│  └───────────────────────────────────────────────────────────────┘           │
│                                │                                              │
│  ┌─────────────────────────────▼─────────────────────────────────┐           │
│  │                      Data Layer                                │           │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │           │
│  │  │ PostgreSQL  │  │    Redis    │  │   S3/Blob   │            │           │
│  │  │  (Primary)  │  │   (Cache)   │  │  (Logs)     │            │           │
│  │  └─────────────┘  └─────────────┘  └─────────────┘            │           │
│  └───────────────────────────────────────────────────────────────┘           │
└──────────────────────────────────┬───────────────────────────────────────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
            ┌───────▼──────┐ ┌─────▼─────┐ ┌─────▼─────┐
            │  Claude API  │ │  Twilio   │ │ SendGrid  │
            │  (AI Text)   │ │   (SMS)   │ │  (Email)  │
            └──────────────┘ └───────────┘ └───────────┘
                                   │
                                   ▼
                          [Reach Dormant Leads]
```

### Component Breakdown

| Component | Technology | Purpose |
|-----------|------------|---------|
| **API Gateway** | NestJS | REST endpoints, webhook receiver |
| **OAuth Service** | NestJS module | Token storage, refresh, validation |
| **Webhook Handler** | NestJS + Bull Queue | Process HubSpot events asynchronously |
| **Dormancy Detector** | Scheduled job | Identify leads meeting dormancy criteria |
| **AI Generator** | Claude API | Generate personalized messages |
| **Campaign Executor** | NestJS service | Orchestrate sending via multiple channels |
| **Database** | PostgreSQL | Store settings, campaigns, logs |
| **Cache** | Redis | Token cache, rate limiting, job queue |

---

## HubSpot APIs Deep Dive

### APIs We'll Use

#### 1. CRM Contacts API
**Purpose**: Read contact data, properties, engagement history

```typescript
// GET contact with properties
GET /crm/v3/objects/contacts/{contactId}
  ?properties=email,firstname,lastname,hs_email_last_open_date,
              hs_email_last_click_date,notes_last_contacted,
              hs_analytics_last_visit_timestamp

// Search contacts with filters
POST /crm/v3/objects/contacts/search
{
  "filterGroups": [{
    "filters": [{
      "propertyName": "notes_last_contacted",
      "operator": "LT",
      "value": "1704067200000" // Unix timestamp (30 days ago)
    }]
  }],
  "properties": ["email", "firstname", "lastname", "company"],
  "limit": 100
}
```

**Key Properties for Dormancy Detection**:
| Property | Description |
|----------|-------------|
| `notes_last_contacted` | Last time sales contacted this person |
| `hs_email_last_open_date` | Last email open |
| `hs_email_last_click_date` | Last email click |
| `hs_analytics_last_visit_timestamp` | Last website visit |
| `hs_sales_email_last_replied` | Last email reply |
| `num_contacted_notes` | Total contact attempts |

#### 2. CRM Deals API
**Purpose**: Check deal status, identify stalled opportunities

```typescript
// Get deals in specific stages
POST /crm/v3/objects/deals/search
{
  "filterGroups": [{
    "filters": [
      {
        "propertyName": "dealstage",
        "operator": "IN",
        "values": ["qualifiedtobuy", "presentationscheduled"]
      },
      {
        "propertyName": "notes_last_updated",
        "operator": "LT",
        "value": "1704067200000"
      }
    ]
  }],
  "properties": ["dealname", "amount", "dealstage", "closedate"]
}
```

#### 3. Engagements API (Email/Calls/Tasks)
**Purpose**: Check last activities, log our outreach

```typescript
// Log an email sent by our plugin
POST /crm/v3/objects/emails
{
  "properties": {
    "hs_timestamp": "2025-01-31T10:00:00.000Z",
    "hs_email_direction": "EMAIL",
    "hs_email_status": "SENT",
    "hs_email_subject": "Quick follow-up",
    "hs_email_text": "Hi John, I wanted to check in...",
    "hs_email_to_email": "john@company.com",
    "hs_email_from_email": "sales@yourcompany.com"
  },
  "associations": [{
    "to": { "id": 12345 },  // Contact ID
    "types": [{ "associationCategory": "HUBSPOT_DEFINED", "associationTypeId": 198 }]
  }]
}

// Create a follow-up task
POST /crm/v3/objects/tasks
{
  "properties": {
    "hs_task_subject": "Follow up with John - Reactivation",
    "hs_task_body": "AI reactivation email sent. Contact replied with interest.",
    "hs_task_status": "NOT_STARTED",
    "hs_task_priority": "HIGH",
    "hs_timestamp": "2025-02-03T09:00:00.000Z",
    "hubspot_owner_id": "12345"
  }
}
```

#### 4. Webhooks API
**Purpose**: Real-time notifications when contacts/deals change

```typescript
// Subscribe to events (configured in your app)
// Events we care about:
// - contact.propertyChange (email opens, replies)
// - deal.propertyChange (stage changes)
// - contact.creation (new leads)

// Webhook payload example
{
  "subscriptionType": "contact.propertyChange",
  "portalId": 12345678,
  "objectId": 987654,
  "propertyName": "hs_email_last_open_date",
  "propertyValue": "1706713200000"
}
```

**Webhook Subscription Types**:
| Event | Use Case |
|-------|----------|
| `contact.propertyChange` | Detect email opens/clicks (stop sequence) |
| `deal.propertyChange` | Detect deal stage movement |
| `contact.associationChange` | Contact linked to new deal |

#### 5. Sequences API (v4)
**Purpose**: Enroll contacts in existing HubSpot sequences

```typescript
// Enroll contact in a sequence
POST /automation/v4/sequences/enrollments
{
  "sequenceId": "123456789",
  "contactId": "987654321",
  "userId": "111222333",  // Sales rep user ID
  "startingStepOrder": 0
}

// Check enrollment status
GET /automation/v4/sequences/enrollments/contact/{contactId}
```

> **Important**: Sequences API requires Sales Hub Professional or Enterprise!

#### 6. Transactional Email API (Optional - for direct sending)
**Purpose**: Send emails directly via HubSpot

```typescript
// Send via Single-Send API
POST /marketing/v3/transactional/single-email/send
{
  "emailId": 123456789,  // Template ID created in HubSpot
  "message": {
    "to": "john@company.com",
    "from": "sales@yourcompany.com",
    "sendId": "unique-send-id-123"
  },
  "customProperties": {
    "first_name": "John",
    "company_name": "Acme Corp",
    "personalized_message": "I noticed you were looking at our Enterprise plan..."
  }
}
```

> **Important**: Requires Transactional Email Add-on (paid extra)

---

## Data Flow & Processing

### Flow 1: Initial Sync (On Installation)

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   HubSpot   │     │  Your API   │     │  Job Queue  │     │  Database   │
│    OAuth    │────▶│  /install   │────▶│  sync_job   │────▶│   Contacts  │
│   Redirect  │     │  callback   │     │             │     │   + Deals   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    Store tokens
                    (encrypted)
```

### Flow 2: Dormancy Detection (Scheduled Job)

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Cron Job   │     │   HubSpot   │     │  Dormancy   │     │   Create    │
│  (Daily)    │────▶│  Search API │────▶│  Analysis   │────▶│  Campaign   │
│  2:00 AM    │     │             │     │  Engine     │     │  Records    │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                                               │
                    ┌──────────────────────────┘
                    ▼
            ┌─────────────┐
            │  Criteria   │
            │  Checking:  │
            │ • Days idle │
            │ • No opens  │
            │ • Deal stage│
            │ • Lead score│
            └─────────────┘
```

### Flow 3: AI Message Generation & Sending

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Campaign   │     │   Contact   │     │  Claude AI  │     │   Review    │
│   Queue     │────▶│   Context   │────▶│  Generate   │────▶│  (Optional) │
│             │     │  Gathering  │     │   Message   │     │             │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                           │                                       │
            ┌──────────────┘                                       │
            ▼                                                      ▼
     ┌─────────────┐                                    ┌─────────────────┐
     │ Pull from   │                                    │ Auto-approve OR │
     │ HubSpot:    │                                    │ Human review    │
     │ • History   │                                    │ in dashboard    │
     │ • Company   │                                    └────────┬────────┘
     │ • Deal info │                                             │
     │ • Past msgs │                                             ▼
     └─────────────┘                                    ┌─────────────────┐
                                                        │  Send via:      │
                                                        │ • HubSpot Email │
                                                        │ • SendGrid      │
                                                        │ • Twilio SMS    │
                                                        └────────┬────────┘
                                                                 │
                                                                 ▼
                                                        ┌─────────────────┐
                                                        │ Log engagement  │
                                                        │ in HubSpot CRM  │
                                                        └─────────────────┘
```

### Flow 4: Response Handling (Webhook-Driven)

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  HubSpot    │     │  Webhook    │     │  Response   │     │   Action    │
│  Webhook    │────▶│  Handler    │────▶│  Classifier │────▶│  Router     │
│  (Push)     │     │  /webhooks  │     │  (AI)       │     │             │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                                               │                   │
                                               ▼                   ▼
                                        ┌─────────────┐     ┌─────────────┐
                                        │ Categories: │     │ Actions:    │
                                        │ • Interested│────▶│ Create task │
                                        │ • Not now   │────▶│ Schedule    │
                                        │ • No thanks │────▶│ Stop seq    │
                                        │ • Bounced   │────▶│ Mark invalid│
                                        └─────────────┘     └─────────────┘
```

---

## Email/SMS Sending Strategy

### Option A: Use HubSpot Sequences (Recommended for Pro+ customers)

**Pros**:
- Emails come from rep's connected inbox
- Native HubSpot tracking (opens, clicks, replies)
- Respects HubSpot's sending limits
- No additional email costs

**Cons**:
- Requires Sales Hub Pro/Enterprise
- Limited to existing sequence templates
- Can't fully customize send logic

**Implementation**:
```typescript
// Enroll contact in a reactivation sequence
async enrollInSequence(contactId: string, sequenceId: string, userId: string) {
  await this.hubspotClient.automation.sequences.enrollments.create({
    sequenceId,
    contactId,
    userId,
    startingStepOrder: 0
  });
}
```

### Option B: External Email Provider (SendGrid/Postmark)

**Pros**:
- Full control over sending logic
- Works with any HubSpot plan
- Can send higher volumes
- Custom tracking/analytics

**Cons**:
- Additional cost
- Need to log emails back to HubSpot
- Deliverability management

**Implementation**:
```typescript
// Send via SendGrid, then log to HubSpot
async sendAndLog(contact: Contact, message: GeneratedMessage) {
  // 1. Send via SendGrid
  const sendGridResponse = await this.sendGrid.send({
    to: contact.email,
    from: contact.ownerEmail,
    subject: message.subject,
    html: message.bodyHtml,
    trackingSettings: { clickTracking: { enable: true } }
  });
  
  // 2. Log to HubSpot
  await this.hubspotClient.crm.objects.emails.create({
    properties: {
      hs_timestamp: new Date().toISOString(),
      hs_email_direction: 'EMAIL',
      hs_email_status: 'SENT',
      hs_email_subject: message.subject,
      hs_email_text: message.bodyText,
      hs_email_to_email: contact.email
    },
    associations: [{
      to: { id: contact.hubspotId },
      types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 198 }]
    }]
  });
}
```

### Option C: HubSpot Transactional Email API

**Pros**:
- Native HubSpot integration
- Good deliverability (dedicated IP)
- Uses HubSpot templates

**Cons**:
- Requires Transactional Email Add-on ($$$)
- Only for Enterprise customers typically

### SMS via Twilio

```typescript
async sendSms(contact: Contact, message: string) {
  // Check if contact has SMS consent
  if (!contact.smsOptIn) return;
  
  const twilioResponse = await this.twilio.messages.create({
    body: message,
    from: process.env.TWILIO_PHONE,
    to: contact.phone
  });
  
  // Log as communication in HubSpot
  await this.hubspotClient.crm.objects.communications.create({
    properties: {
      hs_communication_channel_type: 'SMS',
      hs_communication_body: message,
      hs_timestamp: new Date().toISOString()
    },
    associations: [{
      to: { id: contact.hubspotId },
      types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 81 }]
    }]
  });
}
```

---

## AI Content Generation

### Prompt Engineering for Reactivation Emails

```typescript
const systemPrompt = `You are an expert B2B sales copywriter. Generate a personalized reactivation email for a dormant lead.

Rules:
- Keep it short (3-5 sentences max)
- Reference something specific about their company/situation
- Don't be pushy or salesy
- Include a soft call-to-action
- Sound human, not AI-generated
- Match the tone of previous successful emails if provided`;

const userPrompt = `
Contact: ${contact.firstName} ${contact.lastName}
Company: ${contact.company}
Title: ${contact.jobTitle}
Industry: ${contact.industry}

Last interaction: ${contact.lastContactDate}
Previous interest: ${contact.dealName} (${contact.dealStage})
Past email topics: ${contact.emailHistory.map(e => e.subject).join(', ')}

Days since last contact: ${daysSinceContact}

Generate a reactivation email that:
1. Acknowledges time has passed
2. References their specific situation
3. Provides a low-pressure next step
`;
```

### Message Variants

Generate multiple variants for A/B testing:

```typescript
async generateVariants(contact: Contact, count: number = 3): Promise<EmailVariant[]> {
  const variants = [];
  
  for (const tone of ['casual', 'professional', 'curious']) {
    const response = await this.claude.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `${userPrompt}\n\nTone: ${tone}`
      }]
    });
    
    variants.push({
      tone,
      subject: this.extractSubject(response),
      body: this.extractBody(response)
    });
  }
  
  return variants;
}
```

---

## Database Schema

### Core Tables

```sql
-- Installed HubSpot accounts (multi-tenant)
CREATE TABLE hubspot_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_id BIGINT UNIQUE NOT NULL,
  company_name VARCHAR(255),
  
  -- OAuth tokens (encrypted at rest)
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  token_expires_at TIMESTAMP NOT NULL,
  
  -- Settings
  settings JSONB DEFAULT '{}',
  
  -- Subscription/billing
  plan VARCHAR(50) DEFAULT 'free',
  monthly_email_limit INT DEFAULT 100,
  emails_sent_this_month INT DEFAULT 0,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Dormancy detection rules per account
CREATE TABLE dormancy_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES hubspot_accounts(id),
  
  name VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  
  -- Criteria (JSONB for flexibility)
  criteria JSONB NOT NULL,
  -- Example:
  -- {
  --   "min_days_inactive": 30,
  --   "no_email_opens_days": 14,
  --   "deal_stages": ["qualifiedtobuy", "presentationscheduled"],
  --   "exclude_tags": ["vip", "do-not-contact"],
  --   "min_lead_score": 50
  -- }
  
  -- What to do when matched
  action_type VARCHAR(50) NOT NULL, -- 'sequence', 'email', 'sms', 'task'
  action_config JSONB NOT NULL,
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- Campaigns (batch of reactivation attempts)
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES hubspot_accounts(id),
  rule_id UUID REFERENCES dormancy_rules(id),
  
  name VARCHAR(255),
  status VARCHAR(50) DEFAULT 'draft', -- draft, scheduled, running, completed, paused
  
  -- Stats
  total_contacts INT DEFAULT 0,
  emails_sent INT DEFAULT 0,
  emails_opened INT DEFAULT 0,
  emails_replied INT DEFAULT 0,
  meetings_booked INT DEFAULT 0,
  
  scheduled_at TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- Individual outreach records
CREATE TABLE outreach_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id),
  account_id UUID REFERENCES hubspot_accounts(id),
  
  -- HubSpot references
  hubspot_contact_id BIGINT NOT NULL,
  hubspot_deal_id BIGINT,
  
  -- Contact snapshot (denormalized for history)
  contact_email VARCHAR(255),
  contact_name VARCHAR(255),
  company_name VARCHAR(255),
  
  -- Message content
  channel VARCHAR(50) NOT NULL, -- 'email', 'sms'
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  
  -- AI generation metadata
  ai_model VARCHAR(100),
  ai_prompt_tokens INT,
  ai_completion_tokens INT,
  
  -- Status tracking
  status VARCHAR(50) DEFAULT 'pending',
  -- pending, approved, sent, delivered, opened, clicked, replied, bounced, failed
  
  sent_at TIMESTAMP,
  opened_at TIMESTAMP,
  clicked_at TIMESTAMP,
  replied_at TIMESTAMP,
  
  -- External IDs
  sendgrid_message_id VARCHAR(255),
  twilio_message_sid VARCHAR(255),
  hubspot_email_id BIGINT,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Response tracking and classification
CREATE TABLE responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outreach_id UUID REFERENCES outreach_records(id),
  
  response_type VARCHAR(50), -- 'email_reply', 'meeting_booked', 'phone_call'
  
  -- AI classification
  sentiment VARCHAR(50), -- 'positive', 'neutral', 'negative'
  intent VARCHAR(50), -- 'interested', 'not_now', 'not_interested', 'unsubscribe'
  
  -- Content
  content TEXT,
  
  -- What action was taken
  action_taken VARCHAR(100),
  task_created_id BIGINT,
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_outreach_account_status ON outreach_records(account_id, status);
CREATE INDEX idx_outreach_hubspot_contact ON outreach_records(hubspot_contact_id);
CREATE INDEX idx_campaigns_account ON campaigns(account_id, status);
```

---

## Authentication & Security

### OAuth 2.0 Flow

```typescript
// 1. Generate authorization URL
const authUrl = `https://app.hubspot.com/oauth/authorize?` +
  `client_id=${CLIENT_ID}&` +
  `redirect_uri=${REDIRECT_URI}&` +
  `scope=${SCOPES.join(' ')}`;

// 2. Handle callback
async handleOAuthCallback(code: string) {
  const response = await axios.post('https://api.hubapi.com/oauth/v1/token', {
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    code
  });
  
  const { access_token, refresh_token, expires_in } = response.data;
  
  // 3. Get portal info
  const portalInfo = await this.getPortalInfo(access_token);
  
  // 4. Store encrypted tokens
  await this.storeTokens(portalInfo.portalId, {
    accessToken: encrypt(access_token),
    refreshToken: encrypt(refresh_token),
    expiresAt: Date.now() + (expires_in * 1000)
  });
}

// 5. Token refresh (called before every API call)
async getValidToken(portalId: string): Promise<string> {
  const account = await this.getAccount(portalId);
  
  if (account.tokenExpiresAt < Date.now() + 60000) {
    // Refresh if expiring in < 1 minute
    const response = await axios.post('https://api.hubapi.com/oauth/v1/token', {
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: decrypt(account.refreshToken)
    });
    
    await this.updateTokens(portalId, response.data);
    return response.data.access_token;
  }
  
  return decrypt(account.accessToken);
}
```

### Required OAuth Scopes

```typescript
const SCOPES = [
  // CRM Objects
  'crm.objects.contacts.read',
  'crm.objects.contacts.write',
  'crm.objects.deals.read',
  'crm.objects.companies.read',
  
  // Engagements
  'sales-email-read',
  'crm.objects.emails.write',
  'crm.objects.tasks.write',
  'crm.objects.communications.write',
  
  // Sequences (if using)
  'automation.sequences.read',
  'automation.sequences.write',
  
  // Lists (for segmentation)
  'crm.lists.read',
  
  // Users (for sender assignment)
  'crm.objects.users.read'
];
```

### Webhook Signature Validation

```typescript
async validateWebhook(req: Request): Promise<boolean> {
  const signature = req.headers['x-hubspot-signature-v3'];
  const timestamp = req.headers['x-hubspot-request-timestamp'];
  const body = req.rawBody;
  
  // Reject if too old (>5 minutes)
  if (Date.now() - parseInt(timestamp) > 300000) {
    return false;
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

---

## Deployment Architecture

### Production Setup

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            Cloud Provider (AWS/GCP)                       │
│                                                                           │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐    │
│  │   Load Balancer │     │   API Servers   │     │  Worker Servers │    │
│  │   (ALB/nginx)   │────▶│   (NestJS x3)   │     │  (Bull workers) │    │
│  │                 │     │                 │     │                 │    │
│  │  SSL termination│     │  • REST API     │     │  • Job processing│   │
│  │  Rate limiting  │     │  • Webhooks     │     │  • Email sending │   │
│  └─────────────────┘     │  • OAuth        │     │  • AI generation │   │
│                          └────────┬────────┘     └────────┬────────┘    │
│                                   │                       │             │
│                          ┌────────┴───────────────────────┴────────┐    │
│                          │                                          │    │
│  ┌─────────────────┐     │     ┌─────────────────┐                 │    │
│  │   PostgreSQL    │◀────┴────▶│      Redis      │                 │    │
│  │   (RDS/Cloud    │           │   (ElastiCache) │                 │    │
│  │    SQL)         │           │                 │                 │    │
│  │                 │           │  • Job queues   │                 │    │
│  │  • Primary data │           │  • Token cache  │                 │    │
│  │  • Read replicas│           │  • Rate limits  │                 │    │
│  └─────────────────┘           └─────────────────┘                 │    │
│                                                                     │    │
└─────────────────────────────────────────────────────────────────────┘    │
                                                                           │
                    External Services                                       │
                    ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
                    │ Claude API  │  │   Twilio    │  │  SendGrid   │      │
                    │ (Anthropic) │  │             │  │             │      │
                    └─────────────┘  └─────────────┘  └─────────────┘      │
```

### Environment Variables

```bash
# HubSpot App
HUBSPOT_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
HUBSPOT_CLIENT_SECRET=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
HUBSPOT_APP_ID=123456
HUBSPOT_DEVELOPER_API_KEY=xxx

# Database
DATABASE_URL=postgresql://user:pass@host:5432/dbname
REDIS_URL=redis://host:6379

# AI
ANTHROPIC_API_KEY=sk-ant-xxxxx

# Email
SENDGRID_API_KEY=SG.xxxxx

# SMS
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=xxxxx
TWILIO_PHONE=+1234567890

# Security
ENCRYPTION_KEY=32-byte-key-for-token-encryption
JWT_SECRET=your-jwt-secret

# App
APP_URL=https://yourapp.com
WEBHOOK_URL=https://yourapp.com/api/webhooks/hubspot
```

---

## HubSpot Marketplace Requirements

### Listing Prerequisites

1. **3 Active Installs** - Need customers using your app
2. **Signed AUP** - Acceptable Use Policy
3. **App Verification** - Domain verification
4. **Documentation** - Setup guide, FAQs
5. **Support Channel** - Email or chat for users

### Technical Requirements

| Requirement | Details |
|-------------|---------|
| HTTPS | All endpoints must use HTTPS |
| OAuth 2.0 | Must use OAuth, not API keys |
| Webhook handling | Must respond within 1 second |
| Rate limiting | Respect HubSpot's limits (100 req/10sec) |
| Error handling | Graceful failures, retry logic |

### App Card (UI Extension)

You can add a custom UI card in HubSpot contact/deal records:

```json
// app-hsmeta.json
{
  "name": "dormant-lead-reactivator",
  "displayName": "Dormant Lead Reactivator",
  "description": "AI-powered lead reactivation",
  "uid": "dormant-lead-reactivator",
  "scopes": [...],
  "webhooks": {
    "targetUrl": "https://yourapp.com/api/webhooks"
  },
  "extensions": {
    "crm": {
      "cards": [{
        "file": "DormancyCard.jsx",
        "location": "crm.record.tab"
      }]
    }
  }
}
```

---

## Development Phases

### Phase 1: Foundation (Weeks 1-3)
- [ ] HubSpot developer account setup
- [ ] OAuth flow implementation
- [ ] Basic NestJS backend structure
- [ ] Database schema & migrations
- [ ] Token storage & refresh logic
- [ ] Basic contact sync from HubSpot

### Phase 2: Dormancy Detection (Weeks 4-5)
- [ ] Dormancy criteria configuration UI
- [ ] Contact search & filtering logic
- [ ] Scheduled job for dormancy scanning
- [ ] Dashboard showing dormant leads

### Phase 3: AI Integration (Weeks 6-7)
- [ ] Claude API integration
- [ ] Prompt engineering & testing
- [ ] Message generation service
- [ ] A/B variant generation
- [ ] Human review queue (optional)

### Phase 4: Sending Infrastructure (Weeks 8-9)
- [ ] SendGrid integration
- [ ] HubSpot Sequences integration (optional)
- [ ] Twilio SMS integration
- [ ] Email engagement logging to HubSpot

### Phase 5: Response Handling (Weeks 10-11)
- [ ] Webhook subscription setup
- [ ] Response classification (AI)
- [ ] Auto-task creation for positive responses
- [ ] Campaign pause/stop logic

### Phase 6: Analytics & Polish (Weeks 12-13)
- [ ] Campaign performance dashboard
- [ ] ROI tracking (deals influenced)
- [ ] Settings & configuration UI
- [ ] Error handling & monitoring

### Phase 7: Marketplace Launch (Weeks 14-16)
- [ ] Beta testing with 3+ customers
- [ ] Documentation writing
- [ ] Marketplace listing submission
- [ ] Review & iteration

---

## Quick Start Commands

```bash
# Initialize NestJS project
nest new hubspot-dormant-leads
cd hubspot-dormant-leads

# Install dependencies
npm install @hubspot/api-client @anthropic-ai/sdk
npm install @sendgrid/mail twilio
npm install @nestjs/bull bull
npm install @nestjs/typeorm typeorm pg
npm install ioredis @nestjs/cache-manager

# Generate modules
nest g module hubspot
nest g module campaigns
nest g module ai
nest g module outreach

# Generate services
nest g service hubspot/oauth
nest g service hubspot/contacts
nest g service hubspot/webhooks
nest g service campaigns/dormancy
nest g service ai/generator
nest g service outreach/email
nest g service outreach/sms
```

---

## Next Steps

1. **Create HubSpot Developer Account**: https://developers.hubspot.com
2. **Create a test app** and get OAuth credentials
3. **Set up local development** with ngrok for webhooks
4. **Start with Phase 1** - get OAuth working first
5. **Test with a free HubSpot CRM** account

---

*This architecture is designed to be modular - you can start simple (just email, one sending method) and expand features over time based on customer feedback.*