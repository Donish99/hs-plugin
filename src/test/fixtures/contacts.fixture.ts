/**
 * Test fixtures for contact-related tests
 */

export interface ContactFixture {
  id: string;
  hubspotId: string;
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  jobTitle: string;
  industry: string;
  lastContactDate: Date;
  daysSinceContact: number;
  dealName?: string;
  dealStage?: string;
  dealAmount?: number;
  emailHistory: { subject: string; date: Date }[];
  smsOptIn: boolean;
}

export const dormantContactFixture: ContactFixture = {
  id: '1',
  hubspotId: '12345',
  email: 'john.doe@acmecorp.com',
  firstName: 'John',
  lastName: 'Doe',
  company: 'Acme Corporation',
  jobTitle: 'VP of Sales',
  industry: 'Technology',
  lastContactDate: new Date('2024-01-01'),
  daysSinceContact: 90,
  dealName: 'Enterprise Deal',
  dealStage: 'qualifiedtobuy',
  dealAmount: 50000,
  emailHistory: [
    { subject: 'Following up on our demo', date: new Date('2024-01-01') },
    { subject: 'Proposal for Acme Corp', date: new Date('2023-12-15') },
  ],
  smsOptIn: true,
};

export const activeContactFixture: ContactFixture = {
  id: '2',
  hubspotId: '12346',
  email: 'jane.smith@techcorp.com',
  firstName: 'Jane',
  lastName: 'Smith',
  company: 'Tech Corp',
  jobTitle: 'CTO',
  industry: 'Software',
  lastContactDate: new Date(),
  daysSinceContact: 2,
  dealName: 'Annual License',
  dealStage: 'closedwon',
  dealAmount: 120000,
  emailHistory: [
    { subject: 'Contract signed!', date: new Date() },
  ],
  smsOptIn: false,
};

export const noHistoryContactFixture: ContactFixture = {
  id: '3',
  hubspotId: '12347',
  email: 'bob.wilson@startup.io',
  firstName: 'Bob',
  lastName: 'Wilson',
  company: 'Startup.io',
  jobTitle: 'Founder',
  industry: 'SaaS',
  lastContactDate: new Date('2023-06-01'),
  daysSinceContact: 240,
  emailHistory: [],
  smsOptIn: true,
};

export const contactsListFixture: ContactFixture[] = [
  dormantContactFixture,
  activeContactFixture,
  noHistoryContactFixture,
];
