/**
 * Application configuration factory
 * Loads and validates environment variables
 */

export interface AppConfig {
  port: number;
  nodeEnv: string;
  appUrl: string;
}

export interface HubspotConfig {
  clientId: string;
  clientSecret: string;
  appId: string;
  developerApiKey?: string;
  redirectUri: string;
  scopes: string[];
}

export interface DatabaseConfig {
  url: string;
}

export interface RedisConfig {
  url: string;
}

export interface AiConfig {
  anthropicApiKey: string;
  model: string;
  maxTokens: number;
}

export interface EmailConfig {
  sendgridApiKey: string;
  fromEmail: string;
  fromName: string;
}

export interface SmsConfig {
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioPhone: string;
}

export interface SecurityConfig {
  encryptionKey: string;
  jwtSecret: string;
}

export interface Configuration {
  app: AppConfig;
  hubspot: HubspotConfig;
  database: DatabaseConfig;
  redis: RedisConfig;
  ai: AiConfig;
  email: EmailConfig;
  sms: SmsConfig;
  security: SecurityConfig;
}

export default (): Configuration => ({
  app: {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    appUrl: process.env.APP_URL || 'http://localhost:3000',
  },
  hubspot: {
    clientId: process.env.HUBSPOT_CLIENT_ID || '',
    clientSecret: process.env.HUBSPOT_CLIENT_SECRET || '',
    appId: process.env.HUBSPOT_APP_ID || '',
    developerApiKey: process.env.HUBSPOT_DEVELOPER_API_KEY,
    redirectUri: `${process.env.APP_URL || 'http://localhost:3000'}/api/hubspot/oauth/callback`,
    scopes: [
      'crm.objects.contacts.read',
      'crm.objects.contacts.write',
      'crm.objects.deals.read',
      'crm.objects.companies.read',
      'sales-email-read',
      'crm.objects.emails.write',
      'crm.objects.tasks.write',
      'crm.objects.communications.write',
      'automation.sequences.read',
      'automation.sequences.write',
      'crm.lists.read',
      'crm.objects.users.read',
    ],
  },
  database: {
    url: process.env.DATABASE_URL || 'postgresql://localhost:5432/hubspot_dormant_leads',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  ai: {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    model: 'claude-sonnet-4-20250514',
    maxTokens: 500,
  },
  email: {
    sendgridApiKey: process.env.SENDGRID_API_KEY || '',
    fromEmail: process.env.EMAIL_FROM || 'noreply@example.com',
    fromName: process.env.EMAIL_FROM_NAME || 'Dormant Lead Reactivator',
  },
  sms: {
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || '',
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
    twilioPhone: process.env.TWILIO_PHONE || '',
  },
  security: {
    encryptionKey: process.env.ENCRYPTION_KEY || '',
    jwtSecret: process.env.JWT_SECRET || '',
  },
});
