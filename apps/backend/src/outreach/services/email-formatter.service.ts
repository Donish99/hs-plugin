import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface UnsubscribeConfig {
  unsubscribeUrl: string;
  preferencesUrl?: string;
  companyName: string;
  companyAddress: string;
}

export interface FormatEmailOptions {
  bodyText: string;
  bodyHtml?: string;
  unsubscribeToken?: string;
  contactEmail: string;
}

/**
 * Service for formatting email content with HTML and compliance footer
 */
@Injectable()
export class EmailFormatterService {
  private readonly appUrl: string;
  private readonly companyName: string;
  private readonly companyAddress: string;

  constructor(private readonly configService: ConfigService) {
    this.appUrl = this.configService.get<string>('app.appUrl', 'https://app.example.com');
    this.companyName = this.configService.get<string>('company.name', 'Your Company');
    this.companyAddress = this.configService.get<string>(
      'company.address',
      '123 Main St, City, State 12345',
    );
  }

  /**
   * Convert plain text to HTML with proper paragraph formatting
   */
  textToHtml(text: string): string {
    if (!text || text.trim() === '') {
      return '';
    }

    // First, escape HTML special characters to prevent XSS
    let escaped = this.escapeHtml(text);

    // Convert URLs to clickable links (after escaping, so we can safely add HTML)
    escaped = this.linkifyUrls(escaped);

    // Split by double newlines to create paragraphs
    const paragraphs = escaped.split(/\n\n+/);

    return paragraphs
      .map((para) => {
        const trimmed = para.trim();
        if (!trimmed) return '';

        // Convert single newlines to <br> within paragraphs
        const withBreaks = trimmed.replace(/\n/g, '<br>');
        return `<p>${withBreaks}</p>`;
      })
      .filter(Boolean)
      .join('\n');
  }

  /**
   * Build CAN-SPAM compliant unsubscribe footer
   */
  buildUnsubscribeFooter(config: UnsubscribeConfig): string {
    const preferencesLink = config.preferencesUrl
      ? `<a href="${config.preferencesUrl}" style="color: #6b7280; text-decoration: underline;">manage preferences</a> | `
      : '';

    return `
    <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; text-align: center;">
      <p style="margin: 0 0 8px 0;">
        ${preferencesLink}<a href="${config.unsubscribeUrl}" style="color: #6b7280; text-decoration: underline;">unsubscribe</a>
      </p>
      <p style="margin: 0 0 4px 0;">${this.escapeHtml(config.companyName)}</p>
      <p style="margin: 0;">${this.escapeHtml(config.companyAddress)}</p>
    </div>`;
  }

  /**
   * Format complete email HTML with template and footer
   */
  formatEmailHtml(options: FormatEmailOptions): string {
    // Determine body content: use provided HTML or convert text
    let bodyContent: string;

    if (options.bodyHtml) {
      // Sanitize provided HTML
      bodyContent = this.sanitizeHtml(options.bodyHtml);
    } else {
      // Convert plain text to HTML
      bodyContent = this.textToHtml(options.bodyText);
    }

    // Generate unsubscribe URL
    const unsubscribeUrl = this.generateUnsubscribeUrl(
      options.unsubscribeToken || 'preview',
      options.contactEmail,
    );

    // Build footer
    const footer = this.buildUnsubscribeFooter({
      unsubscribeUrl,
      companyName: this.companyName,
      companyAddress: this.companyAddress,
    });

    // Wrap in email template
    return this.wrapInTemplate(bodyContent, footer);
  }

  /**
   * Generate unsubscribe URL with token and email
   */
  generateUnsubscribeUrl(token: string, email: string): string {
    const encodedEmail = encodeURIComponent(email);
    return `${this.appUrl}/unsubscribe?token=${token}&email=${encodedEmail}`;
  }

  /**
   * Strip HTML tags and convert to plain text
   */
  stripHtml(html: string): string {
    if (!html) return '';

    // Replace links with text + URL
    let text = html.replace(
      /<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi,
      '$2 ($1)',
    );

    // Replace block elements with newlines
    text = text.replace(/<\/(p|div|br|h[1-6]|li)>/gi, '\n');
    text = text.replace(/<(br|hr)[^>]*>/gi, '\n');

    // Remove remaining HTML tags
    text = text.replace(/<[^>]+>/g, '');

    // Decode HTML entities
    text = this.decodeHtmlEntities(text);

    // Clean up whitespace
    text = text.replace(/\n{3,}/g, '\n\n');
    text = text.trim();

    return text;
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    const htmlEscapes: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };

    return text.replace(/[&<>"']/g, (char) => htmlEscapes[char]);
  }

  /**
   * Convert URLs in text to clickable links
   */
  private linkifyUrls(text: string): string {
    // Match URLs (http, https)
    const urlPattern = /(https?:\/\/[^\s<]+)/g;

    return text.replace(urlPattern, (url) => {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: underline;">${url}</a>`;
    });
  }

  /**
   * Sanitize HTML to remove potentially dangerous elements
   */
  private sanitizeHtml(html: string): string {
    // Remove script tags and their content
    let sanitized = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

    // Remove event handlers
    sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');

    // Remove javascript: URLs
    sanitized = sanitized.replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"');

    // Remove style tags (could contain expressions)
    sanitized = sanitized.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

    // Remove iframe, object, embed
    sanitized = sanitized.replace(/<(iframe|object|embed)[^>]*>.*?<\/\1>/gi, '');
    sanitized = sanitized.replace(/<(iframe|object|embed)[^>]*\/?>/gi, '');

    return sanitized;
  }

  /**
   * Wrap email content in responsive HTML template
   */
  private wrapInTemplate(bodyContent: string, footer: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Email</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 16px;
      line-height: 1.6;
      color: #1f2937;
      background-color: #f9fafb;
    }
    .email-container {
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #ffffff;
    }
    .email-body {
      padding: 20px 0;
    }
    .email-body p {
      margin: 0 0 16px 0;
    }
    .email-body p:last-child {
      margin-bottom: 0;
    }
    a {
      color: #2563eb;
    }
    @media only screen and (max-width: 600px) {
      .email-container {
        padding: 16px;
      }
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="email-body">
      ${bodyContent}
    </div>
    ${footer}
  </div>
</body>
</html>`;
  }

  /**
   * Decode common HTML entities
   */
  private decodeHtmlEntities(text: string): string {
    const entities: Record<string, string> = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
      '&nbsp;': ' ',
    };

    return text.replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (entity) => entities[entity] || entity);
  }
}
