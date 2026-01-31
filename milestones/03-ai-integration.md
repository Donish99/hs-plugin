# Milestone 3: AI Integration

## Objective
Integrate OpenAI API to generate personalized reactivation messages based on contact context and history.

---

## Features

### 3.1 OpenAI API Integration
**TDD Approach: Use mocked OpenAI API responses for all tests**
- [x] Create OpenAI API mock for testing
- [x] Write tests for AI service wrapper
  - [x] Test successful message generation
  - [x] Test retry logic with exponential backoff
  - [x] Test rate limiting behavior
  - [x] Test token usage tracking
- [x] Set up OpenAI SDK
- [x] Create AI service wrapper (make tests pass)
- [x] Implement retry logic with exponential backoff
- [x] Handle rate limiting
- [x] Track token usage per account
- [x] Set up cost tracking/limits

### 3.2 Context Gathering
- [x] Fetch contact details from HubSpot:
  - Name, title, company
  - Industry, company size
  - Deal history and stage
  - Previous email subjects/topics
  - Engagement history
- [x] Build contact context object
- [x] Cache context for reuse

### 3.3 Prompt Engineering
- [x] Design system prompt for reactivation emails
- [x] Create prompt templates for:
  - Initial reactivation
  - Follow-up if no response
  - Different industries/personas
  - Different urgency levels
- [x] Include rules:
  - Short messages (3-5 sentences)
  - Reference specific context
  - Non-pushy tone
  - Soft call-to-action
  - Human-sounding language

### 3.4 Message Generation Service
**TDD Approach: Test generation pipeline with mocked AI responses**
- [x] Write tests for generation service
  - [x] Test input validation
  - [x] Test output format validation
  - [x] Test different tone variations
  - [x] Test personalization token insertion
  - [x] Test error handling for malformed AI responses
- [x] Build generation pipeline (make tests pass)
- [x] Input: contact context + dormancy data
- [x] Output: subject line + email body
- [x] Support multiple tones:
  - Casual
  - Professional
  - Curious/inquisitive
- [x] Include personalization tokens
- [x] Validate output format

### 3.5 A/B Variant Generation
- [x] Generate 2-3 variants per contact
- [x] Track which variant is used
- [x] Store all variants for analysis
- [x] Enable manual variant selection

### 3.6 Human Review Queue (Optional)
- [x] Queue messages pending approval
- [x] Review interface:
  - View generated message
  - Edit before sending
  - Approve/reject
  - Request regeneration
- [x] Auto-approve option for trusted rules
- [x] Bulk approval actions

---

## Technical Details

### OpenAI Model Selection
- **Primary Model**: `gpt-4o` for high-quality message generation
- **Fallback Model**: `gpt-4o-mini` for cost optimization
- **Temperature**: 0.7-0.9 for creative variation

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

### Key Files Created
- `src/ai/ai.module.ts` ✓
- `src/ai/services/openai.service.ts` ✓
- `src/ai/services/openai.service.spec.ts` ✓ (28 tests)
- `src/ai/services/generator.service.ts` ✓
- `src/ai/services/generator.service.spec.ts` ✓ (19 tests)
- `src/ai/services/context.service.ts` ✓
- `src/ai/services/context.service.spec.ts` ✓ (17 tests)
- `src/ai/services/prompt.service.ts` ✓
- `src/ai/services/prompt.service.spec.ts` ✓ (25 tests)
- `src/ai/services/variant.service.ts` ✓
- `src/ai/services/variant.service.spec.ts` ✓ (13 tests)
- `src/ai/services/review.service.ts` ✓
- `src/ai/services/review.service.spec.ts` ✓ (14 tests)
- `src/ai/controllers/generation.controller.ts` ✓
- `src/ai/controllers/generation.controller.spec.ts` ✓ (18 tests)
- `src/ai/controllers/review.controller.ts` ✓
- `src/ai/controllers/review.controller.spec.ts` ✓ (12 tests)
- `src/entities/message-variant.entity.ts` ✓
- `src/entities/message-variant.entity.spec.ts` ✓ (10 tests)
- `src/entities/review-queue.entity.ts` ✓
- `src/entities/review-queue.entity.spec.ts` ✓ (18 tests)
- `src/entities/outreach-record.entity.ts` (updated with variant tracking)
- `src/test/mocks/openai.mock.ts` ✓

---

## Acceptance Criteria
- [x] OpenAI API integration working
- [x] Context pulled from HubSpot for each contact
- [x] Messages generated with personalization
- [x] Multiple variants generated per contact
- [x] Token usage tracked per account
- [x] Review queue functional (if enabled)
- [x] Messages sound natural and relevant

## Testing Requirements (TDD)
- [x] OpenAI API mock implementation
- [x] Unit tests for OpenAI service (>80% coverage) - 28 tests
- [x] Unit tests for generator service (>80% coverage) - 19 tests
- [x] Unit tests for context service (>80% coverage) - 17 tests
- [x] Unit tests for prompt service (>80% coverage) - 25 tests
- [x] Unit tests for generation controller (>80% coverage) - 18 tests
- [x] Unit tests for variant service (>80% coverage) - 13 tests
- [x] Unit tests for review service (>80% coverage) - 14 tests
- [x] Unit tests for review controller (>80% coverage) - 12 tests
- [x] Unit tests for message variant entity - 10 tests
- [x] Unit tests for review queue entity - 18 tests
- [x] Test fixtures for contact contexts
- [x] All tests passing before milestone complete (505 total tests)
