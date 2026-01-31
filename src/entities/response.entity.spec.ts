import {
  Response,
  ResponseType,
  ResponseSentiment,
  ResponseIntent,
} from './response.entity';

describe('Response Entity', () => {
  describe('creation', () => {
    it('should create a valid Response instance', () => {
      const response = new Response();
      response.outreachId = 'outreach-123';
      response.responseType = ResponseType.EMAIL_REPLY;
      response.content = 'Thanks for reaching out!';

      expect(response.responseType).toBe(ResponseType.EMAIL_REPLY);
      expect(response.content).toBe('Thanks for reaching out!');
    });
  });

  describe('classification', () => {
    it('should classify as interested', () => {
      const response = new Response();
      response.sentiment = ResponseSentiment.POSITIVE;
      response.intent = ResponseIntent.INTERESTED;

      expect(response.isPositive()).toBe(true);
      expect(response.requiresFollowUp()).toBe(true);
    });

    it('should classify as not interested', () => {
      const response = new Response();
      response.sentiment = ResponseSentiment.NEGATIVE;
      response.intent = ResponseIntent.NOT_INTERESTED;

      expect(response.isPositive()).toBe(false);
      expect(response.shouldStopOutreach()).toBe(true);
    });

    it('should classify as not now (defer)', () => {
      const response = new Response();
      response.sentiment = ResponseSentiment.NEUTRAL;
      response.intent = ResponseIntent.NOT_NOW;

      expect(response.shouldDefer()).toBe(true);
    });

    it('should classify as unsubscribe', () => {
      const response = new Response();
      response.intent = ResponseIntent.UNSUBSCRIBE;

      expect(response.shouldStopOutreach()).toBe(true);
      expect(response.requiresUnsubscribe()).toBe(true);
    });
  });

  describe('response types', () => {
    it('should support email reply type', () => {
      const response = new Response();
      response.responseType = ResponseType.EMAIL_REPLY;

      expect(response.responseType).toBe('email_reply');
    });

    it('should support meeting booked type', () => {
      const response = new Response();
      response.responseType = ResponseType.MEETING_BOOKED;

      expect(response.responseType).toBe('meeting_booked');
    });

    it('should support phone call type', () => {
      const response = new Response();
      response.responseType = ResponseType.PHONE_CALL;

      expect(response.responseType).toBe('phone_call');
    });
  });

  describe('action tracking', () => {
    it('should track action taken', () => {
      const response = new Response();
      response.actionTaken = 'created_task';
      response.taskCreatedId = 12345;

      expect(response.actionTaken).toBe('created_task');
      expect(response.taskCreatedId).toBe(12345);
    });
  });
});
