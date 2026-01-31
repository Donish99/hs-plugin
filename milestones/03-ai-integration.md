# Milestone 3: AI Integration

## Objective
Integrate Claude API to generate personalized reactivation messages based on contact context and history.

---

## Features

### 3.1 Claude API Integration
**TDD Approach: Use mocked Claude API responses for all tests**
- [ ] Create Claude API mock for testing
- [ ] Write tests for AI service wrapper
  - [ ] Test successful message generation
  - [ ] Test retry logic with exponential backoff
  - [ ] Test rate limiting behavior
  - [ ] Test token usage tracking
- [ ] Set up Anthropic SDK
- [ ] Create AI service wrapper (make tests pass)
- [ ] Implement retry logic with exponential backoff
- [ ] Handle rate limiting
- [ ] Track token usage per account
- [ ] Set up cost tracking/limits

### 3.2 Context Gathering
- [ ] Fetch contact details from HubSpot:
  - Name, title, company
  - Industry, company size
  - Deal history and stage
  - Previous email subjects/topics
  - Engagement history
- [ ] Build contact context object
- [ ] Cache context for reuse

### 3.3 Prompt Engineering
- [ ] Design system prompt for reactivation emails
- [ ] Create prompt templates for:
  - Initial reactivation
  - Follow-up if no response
  - Different industries/personas
  - Different urgency levels
- [ ] Include rules:
  - Short messages (3-5 sentences)
  - Reference specific context
  - Non-pushy tone
  - Soft call-to-action
  - Human-sounding language

### 3.4 Message Generation Service
**TDD Approach: Test generation pipeline with mocked AI responses**
- [ ] Write tests for generation service
  - [ ] Test input validation
  - [ ] Test output format validation
  - [ ] Test different tone variations
  - [ ] Test personalization token insertion
  - [ ] Test error handling for malformed AI responses
- [ ] Build generation pipeline (make tests pass)
- [ ] Input: contact context + dormancy data
- [ ] Output: subject line + email body
- [ ] Support multiple tones:
  - Casual
  - Professional
  - Curious/inquisitive
- [ ] Include personalization tokens
- [ ] Validate output format

### 3.5 A/B Variant Generation
- [ ] Generate 2-3 variants per contact
- [ ] Track which variant is used
- [ ] Store all variants for analysis
- [ ] Enable manual variant selection

### 3.6 Human Review Queue (Optional)
- [ ] Queue messages pending approval
- [ ] Review interface:
  - View generated message
  - Edit before sending
  - Approve/reject
  - Request regeneration
- [ ] Auto-approve option for trusted rules
- [ ] Bulk approval actions

---

## Technical Details

### System Prompt Template
```
You are an expert B2B sales copywriter. Generate a personalized
reactivation email for a dormant lead.

Rules:
- Keep it short (3-5 sentences max)
- Reference something specific about their company/situation
- Don't be pushy or salesy
- Include a soft call-to-action
- Sound human, not AI-generated
- Match the tone of previous successful emails if provided
```

### Context Object Structure
```typescript
interface ContactContext {
  firstName: string;
  lastName: string;
  company: string;
  jobTitle: string;
  industry: string;
  lastContactDate: Date;
  daysSinceContact: number;
  dealName?: string;
  dealStage?: string;
  dealAmount?: number;
  emailHistory: { subject: string; date: Date }[];
  previousInterests: string[];
}
```

### Key Files to Create
- `src/ai/ai.module.ts`
- `src/ai/services/generator.service.ts`
- `src/ai/services/context.service.ts`
- `src/ai/services/prompt.service.ts`
- `src/ai/controllers/generation.controller.ts`
- `src/ai/templates/` (prompt templates)

---

## Acceptance Criteria
- [ ] Claude API integration working
- [ ] Context pulled from HubSpot for each contact
- [ ] Messages generated with personalization
- [ ] Multiple variants generated per contact
- [ ] Token usage tracked per account
- [ ] Review queue functional (if enabled)
- [ ] Messages sound natural and relevant

## Testing Requirements (TDD)
- [ ] Claude API mock implementation
- [ ] Unit tests for generator service (>80% coverage)
- [ ] Unit tests for context service (>80% coverage)
- [ ] Unit tests for prompt service (>80% coverage)
- [ ] Integration tests for generation API endpoints
- [ ] Test fixtures for contact contexts
- [ ] All tests passing before milestone complete
