import { Injectable } from '@nestjs/common';
import { ContactContext } from './context.service';

export type MessageTone = 'professional' | 'casual' | 'curious';
export type PromptTemplate = 'reactivation' | 'follow-up' | 'check-in';
export type OutputFormat = 'email' | 'sms';

export interface PromptOptions {
  tone?: MessageTone;
  template?: PromptTemplate;
  maxLength?: number;
}

export interface VariantPrompt {
  tone: MessageTone;
  systemPrompt: string;
  userPrompt: string;
}

export interface PromptValidationResult {
  valid: boolean;
  estimatedTokens: number;
  maxTokens: number;
}

/**
 * Service for building AI prompts for message generation
 */
@Injectable()
export class PromptService {
  private readonly maxPromptTokens = 8000;
  private readonly tones: MessageTone[] = ['professional', 'casual', 'curious'];

  private readonly systemPrompts: Record<PromptTemplate, string> = {
    reactivation: `You are an expert B2B sales copywriter. Generate a personalized reactivation email for a dormant lead.

Rules:
- Keep it short (3-5 sentences max)
- Reference something specific about their company or situation
- Don't be pushy or salesy
- Include a soft call-to-action
- Sound human, not AI-generated
- Match the tone requested

Output format: Respond with valid JSON containing "subject" and "body" fields only.`,

    'follow-up': `You are an expert B2B sales copywriter. Generate a follow-up email for a lead who hasn't responded to a previous outreach.

Rules:
- Keep it very short (2-3 sentences)
- Acknowledge the previous message without being pushy
- Offer value or a different angle
- Include an easy way to respond
- Sound natural and human

Output format: Respond with valid JSON containing "subject" and "body" fields only.`,

    'check-in': `You are an expert B2B sales copywriter. Generate a casual check-in email to reconnect with a past contact.

Rules:
- Keep it brief and friendly (2-4 sentences)
- Reference shared history if available
- No sales pitch - just reconnecting
- Ask an open-ended question
- Sound genuinely interested

Output format: Respond with valid JSON containing "subject" and "body" fields only.`,
  };

  private readonly toneInstructions: Record<MessageTone, string> = {
    professional: `
Tone: Professional and formal
- Use proper business language
- Be respectful and courteous
- Maintain a formal but warm tone`,

    casual: `
Tone: Casual and friendly
- Use conversational language
- Be approachable and warm
- Feel free to use contractions
- Keep it light but still professional`,

    curious: `
Tone: Curious and inquisitive
- Lead with a genuine question
- Show interest in their situation
- Be thoughtful and engaging
- Encourage a dialogue`,
  };

  /**
   * Get the system prompt for a template type
   */
  getSystemPrompt(template: PromptTemplate = 'reactivation'): string {
    return this.systemPrompts[template] || this.systemPrompts.reactivation;
  }

  /**
   * Build the user prompt from contact context
   */
  buildUserPrompt(context: ContactContext): string {
    const lines: string[] = [];

    // Contact information
    const name = [context.firstName, context.lastName].filter(Boolean).join(' ');
    if (name) {
      lines.push(`Contact: ${name}`);
    }

    if (context.company) {
      lines.push(`Company: ${context.company}`);
    }

    if (context.jobTitle) {
      lines.push(`Title: ${context.jobTitle}`);
    }

    if (context.industry) {
      lines.push(`Industry: ${context.industry}`);
    }

    // Engagement information
    if (context.daysSinceContact !== undefined) {
      lines.push(`Days since last contact: ${context.daysSinceContact}`);
    }

    if (context.leadScore !== undefined) {
      lines.push(`Lead score: ${context.leadScore}`);
    }

    // Deal information
    if (context.dealName) {
      lines.push(`Previous deal: ${context.dealName} (${context.dealStage || 'unknown stage'})`);
      if (context.dealAmount) {
        lines.push(`Deal value: $${context.dealAmount.toLocaleString()}`);
      }
    }

    // Email history
    if (context.emailHistory && context.emailHistory.length > 0) {
      const subjects = context.emailHistory.map((e) => e.subject).join(', ');
      lines.push(`Past email topics: ${subjects}`);
    }

    // Previous interests
    if (context.previousInterests && context.previousInterests.length > 0) {
      lines.push(`Previous interests: ${context.previousInterests.join(', ')}`);
    }

    lines.push('');
    lines.push('Generate a personalized reactivation email for this contact.');

    return lines.join('\n');
  }

  /**
   * Build a prompt with specific tone instructions
   */
  buildPromptWithTone(context: ContactContext, options: PromptOptions = {}): string {
    const tone = options.tone || 'professional';
    const basePrompt = this.buildUserPrompt(context);

    return `${basePrompt}\n${this.toneInstructions[tone]}`;
  }

  /**
   * Generate prompts for multiple tone variants
   */
  buildVariantPrompts(context: ContactContext, count: number = 3): VariantPrompt[] {
    const numVariants = Math.min(count, this.tones.length);
    const variants: VariantPrompt[] = [];

    for (let i = 0; i < numVariants; i++) {
      const tone = this.tones[i];
      variants.push({
        tone,
        systemPrompt: this.getSystemPrompt('reactivation'),
        userPrompt: this.buildPromptWithTone(context, { tone }),
      });
    }

    return variants;
  }

  /**
   * Build a prompt for classifying email responses
   */
  buildClassificationPrompt(emailContent: string): string {
    return `Classify this email reply into one of these categories:
- INTERESTED: Wants to learn more or schedule a call
- NOT_NOW: Timing isn't right but may be interested later
- NOT_INTERESTED: Polite decline, doesn't want to proceed
- UNSUBSCRIBE: Wants to be removed from emails
- OUT_OF_OFFICE: Automated away message
- BOUNCED: Delivery failure notification

Reply content:
${emailContent}

Respond with valid JSON in this exact format:
{
  "classification": "CATEGORY_NAME",
  "confidence": 0.0-1.0,
  "reason": "Brief explanation"
}`;
  }

  /**
   * Get output format instructions based on channel
   */
  getOutputFormatInstructions(format: OutputFormat): string {
    if (format === 'sms') {
      return `Output format: Respond with valid JSON containing a "message" field.
The message must be under 160 characters for SMS compatibility.`;
    }

    return `Output format: Respond with valid JSON containing "subject" and "body" fields.
The subject should be under 60 characters.
The body should be 3-5 sentences.`;
  }

  /**
   * Validate prompt length is within token limits
   */
  validatePromptLength(prompt: string): PromptValidationResult {
    const estimatedTokens = this.estimateTokens(prompt);

    return {
      valid: estimatedTokens <= this.maxPromptTokens,
      estimatedTokens,
      maxTokens: this.maxPromptTokens,
    };
  }

  /**
   * Truncate context to fit within token limits
   */
  truncateContext(context: ContactContext, maxTokens: number = 2000): ContactContext {
    const truncated = { ...context };

    // Start by limiting email history
    if (truncated.emailHistory && truncated.emailHistory.length > 5) {
      truncated.emailHistory = truncated.emailHistory.slice(0, 5);
    }

    // Limit previous interests
    if (truncated.previousInterests && truncated.previousInterests.length > 5) {
      truncated.previousInterests = truncated.previousInterests.slice(0, 5);
    }

    // Check if we're still over limit
    const prompt = this.buildUserPrompt(truncated);
    const tokens = this.estimateTokens(prompt);

    if (tokens > maxTokens && truncated.emailHistory) {
      // Further reduce email history
      truncated.emailHistory = truncated.emailHistory.slice(0, 3);
    }

    return truncated;
  }

  /**
   * Estimate token count for a string
   * Rough approximation: ~4 characters per token for English text
   */
  private estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }
}
