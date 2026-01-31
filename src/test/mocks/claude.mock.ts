/**
 * Mock implementation for Claude/Anthropic API client
 * Used in unit and integration tests
 */

export interface MockMessage {
  id: string;
  type: string;
  role: string;
  content: MockContentBlock[];
  model: string;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface MockContentBlock {
  type: string;
  text: string;
}

export const createMockAnthropicClient = () => ({
  messages: {
    create: jest.fn(),
  },
});

export const mockGeneratedEmail: MockMessage = {
  id: 'msg_mock_12345',
  type: 'message',
  role: 'assistant',
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        subject: 'Quick check-in on your project',
        body: `Hi John,

I hope this message finds you well. I noticed it's been a while since we last connected, and I wanted to reach out to see how things are progressing with your project.

Would you have time for a brief call this week to catch up?

Best regards`,
      }),
    },
  ],
  model: 'claude-sonnet-4-20250514',
  stop_reason: 'end_turn',
  usage: {
    input_tokens: 150,
    output_tokens: 75,
  },
};

export const mockClassificationResponse: MockMessage = {
  id: 'msg_mock_67890',
  type: 'message',
  role: 'assistant',
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        classification: 'INTERESTED',
        confidence: 0.92,
        reason: 'Contact expressed desire to schedule a meeting',
      }),
    },
  ],
  model: 'claude-sonnet-4-20250514',
  stop_reason: 'end_turn',
  usage: {
    input_tokens: 100,
    output_tokens: 50,
  },
};

export const mockApiError = {
  status: 429,
  message: 'Rate limit exceeded',
  type: 'rate_limit_error',
};
