/**
 * Mock implementation for OpenAI API client
 * Used in unit and integration tests
 */

export interface MockChatCompletion {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: MockChoice[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface MockChoice {
  index: number;
  message: {
    role: string;
    content: string;
  };
  finish_reason: string;
}

export const createMockOpenAIClient = () => ({
  chat: {
    completions: {
      create: jest.fn(),
    },
  },
});

export const mockGeneratedEmail: MockChatCompletion = {
  id: 'chatcmpl-mock12345',
  object: 'chat.completion',
  created: Date.now(),
  model: 'gpt-4o',
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content: JSON.stringify({
          subject: 'Quick check-in on your project',
          body: `Hi John,

I hope this message finds you well. I noticed it's been a while since we last connected, and I wanted to reach out to see how things are progressing with your project.

Would you have time for a brief call this week to catch up?

Best regards`,
        }),
      },
      finish_reason: 'stop',
    },
  ],
  usage: {
    prompt_tokens: 150,
    completion_tokens: 75,
    total_tokens: 225,
  },
};

export const mockClassificationResponse: MockChatCompletion = {
  id: 'chatcmpl-mock67890',
  object: 'chat.completion',
  created: Date.now(),
  model: 'gpt-4o',
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content: JSON.stringify({
          classification: 'INTERESTED',
          confidence: 0.92,
          reason: 'Contact expressed desire to schedule a meeting',
        }),
      },
      finish_reason: 'stop',
    },
  ],
  usage: {
    prompt_tokens: 100,
    completion_tokens: 50,
    total_tokens: 150,
  },
};

export const mockApiError = {
  status: 429,
  message: 'Rate limit exceeded',
  type: 'rate_limit_error',
};
