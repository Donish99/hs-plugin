/**
 * Test fixtures for HubSpot account-related tests
 */

export interface HubspotAccountFixture {
  id: string;
  portalId: number;
  companyName: string;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string;
  tokenExpiresAt: Date;
  settings: Record<string, unknown>;
  plan: 'free' | 'starter' | 'professional' | 'enterprise';
  monthlyEmailLimit: number;
  emailsSentThisMonth: number;
  createdAt: Date;
  updatedAt: Date;
}

export const freeAccountFixture: HubspotAccountFixture = {
  id: 'account-1',
  portalId: 12345678,
  companyName: 'Startup Inc',
  accessTokenEncrypted: 'encrypted-access-token-123',
  refreshTokenEncrypted: 'encrypted-refresh-token-456',
  tokenExpiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000), // 6 hours from now
  settings: {
    timezone: 'America/New_York',
    businessHoursOnly: true,
  },
  plan: 'free',
  monthlyEmailLimit: 100,
  emailsSentThisMonth: 25,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-15'),
};

export const proAccountFixture: HubspotAccountFixture = {
  id: 'account-2',
  portalId: 87654321,
  companyName: 'Enterprise Corp',
  accessTokenEncrypted: 'encrypted-access-token-789',
  refreshTokenEncrypted: 'encrypted-refresh-token-012',
  tokenExpiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
  settings: {
    timezone: 'Europe/London',
    businessHoursOnly: false,
    autoApprove: true,
  },
  plan: 'professional',
  monthlyEmailLimit: 1000,
  emailsSentThisMonth: 450,
  createdAt: new Date('2023-06-01'),
  updatedAt: new Date('2024-01-20'),
};

export const expiredTokenAccountFixture: HubspotAccountFixture = {
  id: 'account-3',
  portalId: 11111111,
  companyName: 'Token Expired LLC',
  accessTokenEncrypted: 'encrypted-expired-token',
  refreshTokenEncrypted: 'encrypted-refresh-token-expired',
  tokenExpiresAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago (expired)
  settings: {},
  plan: 'starter',
  monthlyEmailLimit: 500,
  emailsSentThisMonth: 0,
  createdAt: new Date('2023-12-01'),
  updatedAt: new Date('2024-01-01'),
};

export const atLimitAccountFixture: HubspotAccountFixture = {
  id: 'account-4',
  portalId: 22222222,
  companyName: 'At Limit Co',
  accessTokenEncrypted: 'encrypted-access-token-limit',
  refreshTokenEncrypted: 'encrypted-refresh-token-limit',
  tokenExpiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
  settings: {},
  plan: 'free',
  monthlyEmailLimit: 100,
  emailsSentThisMonth: 100, // At limit
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-25'),
};

export const accountsListFixture: HubspotAccountFixture[] = [
  freeAccountFixture,
  proAccountFixture,
  expiredTokenAccountFixture,
  atLimitAccountFixture,
];
