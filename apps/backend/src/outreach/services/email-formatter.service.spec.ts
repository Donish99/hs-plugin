import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmailFormatterService, UnsubscribeConfig } from './email-formatter.service';

describe('EmailFormatterService', () => {
  let service: EmailFormatterService;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      const config: Record<string, any> = {
        'app.url': 'https://app.example.com',
        'company.name': 'Test Company',
        'company.address': '123 Main St, San Francisco, CA 94102',
      };
      return config[key] ?? defaultValue;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailFormatterService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<EmailFormatterService>(EmailFormatterService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('textToHtml', () => {
    it('should convert plain text to HTML with paragraph tags', () => {
      const text = 'Hello John,\n\nHow are you doing today?\n\nBest regards';
      const html = service.textToHtml(text);

      expect(html).toContain('<p>Hello John,</p>');
      expect(html).toContain('<p>How are you doing today?</p>');
      expect(html).toContain('<p>Best regards</p>');
    });

    it('should handle single paragraph text', () => {
      const text = 'This is a single paragraph.';
      const html = service.textToHtml(text);

      expect(html).toBe('<p>This is a single paragraph.</p>');
    });

    it('should preserve line breaks within paragraphs', () => {
      const text = 'Line one\nLine two\n\nNew paragraph';
      const html = service.textToHtml(text);

      expect(html).toContain('<p>Line one<br>Line two</p>');
      expect(html).toContain('<p>New paragraph</p>');
    });

    it('should escape HTML special characters', () => {
      const text = 'Check out <script>alert("xss")</script> & more';
      const html = service.textToHtml(text);

      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
      expect(html).toContain('&amp;');
    });

    it('should convert URLs to clickable links', () => {
      const text = 'Visit https://example.com for more info';
      const html = service.textToHtml(text);

      expect(html).toContain('<a href="https://example.com"');
      expect(html).toContain('target="_blank"');
    });

    it('should handle empty text', () => {
      const html = service.textToHtml('');
      expect(html).toBe('');
    });

    it('should trim whitespace from paragraphs', () => {
      const text = '  Hello  \n\n  World  ';
      const html = service.textToHtml(text);

      expect(html).toContain('<p>Hello</p>');
      expect(html).toContain('<p>World</p>');
    });
  });

  describe('buildUnsubscribeFooter', () => {
    it('should generate unsubscribe footer with link', () => {
      const config: UnsubscribeConfig = {
        unsubscribeUrl: 'https://app.example.com/unsubscribe?token=abc123',
        companyName: 'Test Company',
        companyAddress: '123 Main St, San Francisco, CA 94102',
      };

      const footer = service.buildUnsubscribeFooter(config);

      expect(footer).toContain('https://app.example.com/unsubscribe?token=abc123');
      expect(footer).toContain('Test Company');
      expect(footer).toContain('123 Main St, San Francisco, CA 94102');
      expect(footer).toContain('unsubscribe');
    });

    it('should include preferences link when provided', () => {
      const config: UnsubscribeConfig = {
        unsubscribeUrl: 'https://app.example.com/unsubscribe?token=abc123',
        preferencesUrl: 'https://app.example.com/preferences?token=abc123',
        companyName: 'Test Company',
        companyAddress: '123 Main St',
      };

      const footer = service.buildUnsubscribeFooter(config);

      expect(footer).toContain('preferences');
      expect(footer).toContain('https://app.example.com/preferences?token=abc123');
    });
  });

  describe('formatEmailHtml', () => {
    it('should wrap content in email template with footer', () => {
      const result = service.formatEmailHtml({
        bodyText: 'Hello,\n\nThis is a test email.',
        unsubscribeToken: 'abc123',
        contactEmail: 'john@example.com',
      });

      // Should have HTML structure
      expect(result).toContain('<!DOCTYPE html>');
      expect(result).toContain('<html');
      expect(result).toContain('</html>');

      // Should have body content
      expect(result).toContain('<p>Hello,</p>');
      expect(result).toContain('<p>This is a test email.</p>');

      // Should have unsubscribe footer
      expect(result).toContain('unsubscribe');
      expect(result).toContain('abc123');
    });

    it('should use provided HTML if available', () => {
      const result = service.formatEmailHtml({
        bodyText: 'Plain text version',
        bodyHtml: '<p>Custom <strong>HTML</strong> content</p>',
        unsubscribeToken: 'abc123',
        contactEmail: 'john@example.com',
      });

      expect(result).toContain('<strong>HTML</strong>');
      expect(result).not.toContain('Plain text version');
    });

    it('should sanitize HTML content to prevent XSS', () => {
      const result = service.formatEmailHtml({
        bodyText: 'Safe text',
        bodyHtml: '<p>Hello</p><script>alert("xss")</script>',
        unsubscribeToken: 'abc123',
        contactEmail: 'john@example.com',
      });

      expect(result).not.toContain('<script>');
      expect(result).toContain('<p>Hello</p>');
    });

    it('should include contact email in unsubscribe URL', () => {
      const result = service.formatEmailHtml({
        bodyText: 'Test',
        unsubscribeToken: 'token123',
        contactEmail: 'test@example.com',
      });

      // Email is URL-encoded in the unsubscribe link
      expect(result).toContain('test%40example.com');
    });

    it('should have responsive email styling', () => {
      const result = service.formatEmailHtml({
        bodyText: 'Test',
        unsubscribeToken: 'abc123',
        contactEmail: 'john@example.com',
      });

      expect(result).toContain('max-width');
      expect(result).toContain('font-family');
    });

    it('should work without unsubscribe token (preview mode)', () => {
      const result = service.formatEmailHtml({
        bodyText: 'Preview content',
        contactEmail: 'john@example.com',
      });

      expect(result).toContain('Preview content');
      // Should still have footer placeholder or generic footer
      expect(result).toContain('unsubscribe');
    });
  });

  describe('generateUnsubscribeUrl', () => {
    it('should generate URL with token and email', () => {
      const url = service.generateUnsubscribeUrl('token123', 'test@example.com');

      expect(url).toContain('https://app.example.com');
      expect(url).toContain('token123');
      // Email is URL-encoded
      expect(url).toContain('test%40example.com');
    });

    it('should URL-encode email address', () => {
      const url = service.generateUnsubscribeUrl('token', 'test+special@example.com');

      expect(url).toContain(encodeURIComponent('test+special@example.com'));
    });
  });

  describe('stripHtml', () => {
    it('should convert HTML to plain text', () => {
      const html = '<p>Hello <strong>World</strong></p><p>New paragraph</p>';
      const text = service.stripHtml(html);

      expect(text).toContain('Hello World');
      expect(text).toContain('New paragraph');
      expect(text).not.toContain('<p>');
      expect(text).not.toContain('<strong>');
    });

    it('should preserve line breaks from block elements', () => {
      const html = '<p>First</p><p>Second</p>';
      const text = service.stripHtml(html);

      expect(text).toContain('First');
      expect(text).toContain('Second');
      // Should have some separation between paragraphs
      expect(text).toMatch(/First[\s\n]+Second/);
    });

    it('should handle links by including URL', () => {
      const html = '<a href="https://example.com">Click here</a>';
      const text = service.stripHtml(html);

      expect(text).toContain('Click here');
      expect(text).toContain('https://example.com');
    });
  });
});
