/**
 * Mock implementation for SendGrid email client
 * Used in unit and integration tests
 */

export interface MockSendGridResponse {
  statusCode: number;
  body: string;
  headers: Record<string, string>;
}

export const createMockSendGridClient = () => ({
  send: jest.fn(),
  setApiKey: jest.fn(),
});

export const mockSendGridSuccessResponse: [MockSendGridResponse, object] = [
  {
    statusCode: 202,
    body: '',
    headers: {
      'x-message-id': 'mock-message-id-12345',
    },
  },
  {},
];

export const mockSendGridErrorResponse = {
  code: 400,
  message: 'The from address does not match a verified Sender Identity',
  response: {
    headers: {},
    body: {
      errors: [
        {
          message: 'The from address does not match a verified Sender Identity',
          field: 'from.email',
          help: 'http://sendgrid.com/docs/Classroom/Send/v3_Mail_Send/sender_identities.html',
        },
      ],
    },
  },
};

export const mockEmailPayload = {
  to: 'recipient@example.com',
  from: 'sender@example.com',
  subject: 'Test Email',
  text: 'This is a test email',
  html: '<p>This is a test email</p>',
  trackingSettings: {
    clickTracking: {
      enable: true,
    },
    openTracking: {
      enable: true,
    },
  },
};
