/**
 * Mock implementation for Twilio SMS client
 * Used in unit and integration tests
 */

export interface MockTwilioMessage {
  sid: string;
  status: string;
  dateCreated: Date;
  dateSent: Date | null;
  to: string;
  from: string;
  body: string;
  numSegments: string;
  errorCode: number | null;
  errorMessage: string | null;
}

export const createMockTwilioClient = () => ({
  messages: {
    create: jest.fn(),
  },
});

export const mockTwilioSuccessResponse: MockTwilioMessage = {
  sid: 'SM1234567890abcdef',
  status: 'queued',
  dateCreated: new Date(),
  dateSent: null,
  to: '+1234567890',
  from: '+0987654321',
  body: 'Test SMS message',
  numSegments: '1',
  errorCode: null,
  errorMessage: null,
};

export const mockTwilioDeliveredResponse: MockTwilioMessage = {
  sid: 'SM1234567890abcdef',
  status: 'delivered',
  dateCreated: new Date(),
  dateSent: new Date(),
  to: '+1234567890',
  from: '+0987654321',
  body: 'Test SMS message',
  numSegments: '1',
  errorCode: null,
  errorMessage: null,
};

export const mockTwilioErrorResponse = {
  status: 400,
  code: 21211,
  message: "The 'To' number is not a valid phone number.",
  moreInfo: 'https://www.twilio.com/docs/errors/21211',
};

export const mockSmsPayload = {
  to: '+1234567890',
  from: '+0987654321',
  body: 'Hi John, just checking in on your project. Reply if you have a moment to connect.',
};
