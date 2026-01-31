import { Test, TestingModule } from '@nestjs/testing';
import {
  DormancyDetectionService,
  DormancyScore,
  PrioritizedContact,
  DormancyReport,
  ContactEngagementData,
} from './dormancy-detection.service';
import { HubSpotContact } from './scanner.service';

describe('DormancyDetectionService', () => {
  let service: DormancyDetectionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DormancyDetectionService],
    }).compile();

    service = module.get<DormancyDetectionService>(DormancyDetectionService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('calculateDormancyScore', () => {
    it('should calculate score based on days since last contact', () => {
      const now = new Date('2024-06-01');
      jest.useFakeTimers().setSystemTime(now);

      const contact: HubSpotContact = {
        id: '1',
        properties: {
          email: 'test@example.com',
          notes_last_contacted: '2024-03-01', // 92 days ago
        },
        createdAt: '2024-01-01',
        updatedAt: '2024-03-01',
      };

      const score = service.calculateDormancyScore(contact);

      expect(score.totalScore).toBeGreaterThan(0);
      expect(score.factors.daysSinceLastContact).toBe(92);
      expect(score.factors.lastContactScore).toBeGreaterThan(0);
    });

    it('should calculate score based on email engagement', () => {
      const now = new Date('2024-06-01');
      jest.useFakeTimers().setSystemTime(now);

      const contact: HubSpotContact = {
        id: '2',
        properties: {
          email: 'test@example.com',
          hs_email_last_open_date: '2024-04-01', // 61 days ago
          hs_email_last_click_date: '2024-03-15', // 78 days ago
        },
        createdAt: '2024-01-01',
        updatedAt: '2024-04-01',
      };

      const score = service.calculateDormancyScore(contact);

      expect(score.factors.daysSinceLastOpen).toBe(61);
      expect(score.factors.daysSinceLastClick).toBe(78);
      expect(score.factors.emailEngagementScore).toBeGreaterThan(0);
    });

    it('should calculate score based on website visits', () => {
      const now = new Date('2024-06-01');
      jest.useFakeTimers().setSystemTime(now);

      const contact: HubSpotContact = {
        id: '3',
        properties: {
          email: 'test@example.com',
          hs_analytics_last_visit_timestamp: '2024-02-01', // 121 days ago
        },
        createdAt: '2024-01-01',
        updatedAt: '2024-02-01',
      };

      const score = service.calculateDormancyScore(contact);

      expect(score.factors.daysSinceLastVisit).toBe(121);
      expect(score.factors.websiteEngagementScore).toBeGreaterThan(0);
    });

    it('should return maximum score for contacts with no engagement history', () => {
      const contact: HubSpotContact = {
        id: '4',
        properties: {
          email: 'test@example.com',
          // No engagement properties
        },
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };

      const score = service.calculateDormancyScore(contact);

      // Should have high score due to missing engagement data
      expect(score.totalScore).toBeGreaterThanOrEqual(80);
      expect(score.factors.daysSinceLastContact).toBeNull();
      expect(score.factors.daysSinceLastOpen).toBeNull();
    });

    it('should handle zero values correctly', () => {
      const now = new Date('2024-06-01');
      jest.useFakeTimers().setSystemTime(now);

      const contact: HubSpotContact = {
        id: '5',
        properties: {
          email: 'test@example.com',
          notes_last_contacted: now.toISOString(), // Today
          hs_email_last_open_date: now.toISOString(), // Today
        },
        createdAt: '2024-01-01',
        updatedAt: now.toISOString(),
      };

      const score = service.calculateDormancyScore(contact);

      expect(score.factors.daysSinceLastContact).toBe(0);
      expect(score.factors.daysSinceLastOpen).toBe(0);
      expect(score.totalScore).toBeLessThan(20); // Low dormancy score
    });

    it('should combine all factors into weighted total score', () => {
      const now = new Date('2024-06-01');
      jest.useFakeTimers().setSystemTime(now);

      const contact: HubSpotContact = {
        id: '6',
        properties: {
          email: 'test@example.com',
          notes_last_contacted: '2024-03-01',
          hs_email_last_open_date: '2024-04-01',
          hs_email_last_click_date: '2024-03-15',
          hs_analytics_last_visit_timestamp: '2024-05-01',
        },
        createdAt: '2024-01-01',
        updatedAt: '2024-05-01',
      };

      const score = service.calculateDormancyScore(contact);

      // Total score should be between 0-100
      expect(score.totalScore).toBeGreaterThanOrEqual(0);
      expect(score.totalScore).toBeLessThanOrEqual(100);
      expect(score.calculatedAt).toBeInstanceOf(Date);
    });

    it('should handle invalid date strings gracefully', () => {
      const contact: HubSpotContact = {
        id: '7',
        properties: {
          email: 'test@example.com',
          notes_last_contacted: 'invalid-date',
          hs_email_last_open_date: '',
        },
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };

      const score = service.calculateDormancyScore(contact);

      // Should handle gracefully and return valid score
      expect(score.totalScore).toBeDefined();
      expect(score.factors.daysSinceLastContact).toBeNull();
      expect(score.factors.daysSinceLastOpen).toBeNull();
    });
  });

  describe('prioritizeContacts', () => {
    const baseContacts: HubSpotContact[] = [
      {
        id: '1',
        properties: {
          email: 'low@example.com',
          hubspotscore: '20',
          notes_last_contacted: '2024-01-01',
        },
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      },
      {
        id: '2',
        properties: {
          email: 'high@example.com',
          hubspotscore: '90',
          notes_last_contacted: '2024-03-01',
        },
        createdAt: '2024-01-01',
        updatedAt: '2024-03-01',
      },
      {
        id: '3',
        properties: {
          email: 'medium@example.com',
          hubspotscore: '50',
          notes_last_contacted: '2024-02-01',
        },
        createdAt: '2024-01-01',
        updatedAt: '2024-02-01',
      },
    ];

    it('should prioritize contacts by lead score', () => {
      const prioritized = service.prioritizeContacts(baseContacts, {
        sortBy: 'leadScore',
        sortOrder: 'desc',
      });

      expect(prioritized[0].contact.id).toBe('2'); // hubspotscore: 90
      expect(prioritized[1].contact.id).toBe('3'); // hubspotscore: 50
      expect(prioritized[2].contact.id).toBe('1'); // hubspotscore: 20
    });

    it('should prioritize contacts by dormancy score', () => {
      const now = new Date('2024-06-01');
      jest.useFakeTimers().setSystemTime(now);

      const prioritized = service.prioritizeContacts(baseContacts, {
        sortBy: 'dormancyScore',
        sortOrder: 'desc',
      });

      // Contact 1 (oldest contact date) should have highest dormancy score
      expect(prioritized[0].contact.id).toBe('1');
      expect(prioritized[0].dormancyScore.totalScore).toBeGreaterThan(
        prioritized[2].dormancyScore.totalScore,
      );
    });

    it('should prioritize contacts by recency of engagement', () => {
      const now = new Date('2024-06-01');
      jest.useFakeTimers().setSystemTime(now);

      const prioritized = service.prioritizeContacts(baseContacts, {
        sortBy: 'recency',
        sortOrder: 'desc', // Most recent first (descending by date)
      });

      expect(prioritized[0].contact.id).toBe('2'); // March 1 - most recent
      expect(prioritized[2].contact.id).toBe('1'); // January 1 - oldest
    });

    it('should prioritize contacts by deal value when deal data available', () => {
      const contactsWithDeals: HubSpotContact[] = [
        {
          id: '1',
          properties: {
            email: 'small@example.com',
            hs_deal_amount: '5000',
          },
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
        {
          id: '2',
          properties: {
            email: 'large@example.com',
            hs_deal_amount: '100000',
          },
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
        {
          id: '3',
          properties: {
            email: 'medium@example.com',
            hs_deal_amount: '25000',
          },
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
      ];

      const prioritized = service.prioritizeContacts(contactsWithDeals, {
        sortBy: 'dealValue',
        sortOrder: 'desc',
      });

      expect(prioritized[0].contact.id).toBe('2'); // $100,000
      expect(prioritized[1].contact.id).toBe('3'); // $25,000
      expect(prioritized[2].contact.id).toBe('1'); // $5,000
    });

    it('should handle contacts without deal value', () => {
      const mixedContacts: HubSpotContact[] = [
        {
          id: '1',
          properties: { email: 'nodeal@example.com' },
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
        {
          id: '2',
          properties: { email: 'hasdeal@example.com', hs_deal_amount: '50000' },
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
      ];

      const prioritized = service.prioritizeContacts(mixedContacts, {
        sortBy: 'dealValue',
        sortOrder: 'desc',
      });

      // Contact with deal should come first
      expect(prioritized[0].contact.id).toBe('2');
      expect(prioritized[0].dealValue).toBe(50000);
      expect(prioritized[1].dealValue).toBe(0);
    });

    it('should calculate composite priority score', () => {
      const prioritized = service.prioritizeContacts(baseContacts, {
        sortBy: 'composite',
        sortOrder: 'desc',
      });

      // Each contact should have a priority score
      for (const p of prioritized) {
        expect(p.priorityScore).toBeGreaterThanOrEqual(0);
        expect(p.priorityScore).toBeLessThanOrEqual(100);
      }
    });

    it('should limit results when limit option provided', () => {
      const prioritized = service.prioritizeContacts(baseContacts, {
        sortBy: 'leadScore',
        sortOrder: 'desc',
        limit: 2,
      });

      expect(prioritized).toHaveLength(2);
    });

    it('should return empty array for empty input', () => {
      const prioritized = service.prioritizeContacts([], {
        sortBy: 'leadScore',
        sortOrder: 'desc',
      });

      expect(prioritized).toEqual([]);
    });

    it('should handle missing lead score gracefully', () => {
      const contactsNoScore: HubSpotContact[] = [
        {
          id: '1',
          properties: { email: 'noscore@example.com' },
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
      ];

      const prioritized = service.prioritizeContacts(contactsNoScore, {
        sortBy: 'leadScore',
        sortOrder: 'desc',
      });

      expect(prioritized[0].leadScore).toBe(0);
    });
  });

  describe('generateDormancyReport', () => {
    const sampleContacts: HubSpotContact[] = [
      {
        id: '1',
        properties: {
          email: 'test1@example.com',
          hubspotscore: '80',
          hs_deal_amount: '50000',
          notes_last_contacted: '2024-01-01',
        },
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      },
      {
        id: '2',
        properties: {
          email: 'test2@example.com',
          hubspotscore: '40',
          hs_deal_amount: '10000',
          notes_last_contacted: '2024-02-01',
        },
        createdAt: '2024-01-01',
        updatedAt: '2024-02-01',
      },
      {
        id: '3',
        properties: {
          email: 'test3@example.com',
          hubspotscore: '60',
          notes_last_contacted: '2024-03-01',
        },
        createdAt: '2024-01-01',
        updatedAt: '2024-03-01',
      },
    ];

    it('should generate report with total contacts count', () => {
      const report = service.generateDormancyReport('rule-123', sampleContacts);

      expect(report.ruleId).toBe('rule-123');
      expect(report.totalContacts).toBe(3);
    });

    it('should calculate average dormancy score', () => {
      const now = new Date('2024-06-01');
      jest.useFakeTimers().setSystemTime(now);

      const report = service.generateDormancyReport('rule-123', sampleContacts);

      expect(report.averageDormancyScore).toBeGreaterThan(0);
      expect(report.averageDormancyScore).toBeLessThanOrEqual(100);
    });

    it('should calculate total potential deal value', () => {
      const report = service.generateDormancyReport('rule-123', sampleContacts);

      expect(report.totalDealValue).toBe(60000); // 50000 + 10000
    });

    it('should categorize contacts by dormancy level', () => {
      const now = new Date('2024-06-01');
      jest.useFakeTimers().setSystemTime(now);

      const report = service.generateDormancyReport('rule-123', sampleContacts);

      expect(report.dormancyDistribution).toBeDefined();
      expect(report.dormancyDistribution.high).toBeGreaterThanOrEqual(0);
      expect(report.dormancyDistribution.medium).toBeGreaterThanOrEqual(0);
      expect(report.dormancyDistribution.low).toBeGreaterThanOrEqual(0);

      // Sum should equal total contacts
      const sum =
        report.dormancyDistribution.high +
        report.dormancyDistribution.medium +
        report.dormancyDistribution.low;
      expect(sum).toBe(3);
    });

    it('should include top priority contacts', () => {
      const report = service.generateDormancyReport('rule-123', sampleContacts);

      expect(report.topPriorityContacts).toBeDefined();
      expect(report.topPriorityContacts.length).toBeLessThanOrEqual(10);
    });

    it('should include report generation timestamp', () => {
      const report = service.generateDormancyReport('rule-123', sampleContacts);

      expect(report.generatedAt).toBeInstanceOf(Date);
    });

    it('should handle empty contacts array', () => {
      const report = service.generateDormancyReport('rule-123', []);

      expect(report.totalContacts).toBe(0);
      expect(report.averageDormancyScore).toBe(0);
      expect(report.totalDealValue).toBe(0);
      expect(report.topPriorityContacts).toEqual([]);
    });

    it('should calculate lead score distribution', () => {
      const report = service.generateDormancyReport('rule-123', sampleContacts);

      expect(report.leadScoreDistribution).toBeDefined();
      expect(report.leadScoreDistribution.high).toBeGreaterThanOrEqual(0); // 70+
      expect(report.leadScoreDistribution.medium).toBeGreaterThanOrEqual(0); // 40-69
      expect(report.leadScoreDistribution.low).toBeGreaterThanOrEqual(0); // 0-39
    });
  });

  describe('getContactEngagementData', () => {
    it('should extract all engagement data from contact', () => {
      const now = new Date('2024-06-01');
      jest.useFakeTimers().setSystemTime(now);

      const contact: HubSpotContact = {
        id: '1',
        properties: {
          email: 'test@example.com',
          firstname: 'John',
          lastname: 'Doe',
          company: 'Acme Corp',
          notes_last_contacted: '2024-03-01',
          hs_email_last_open_date: '2024-04-01',
          hs_email_last_click_date: '2024-03-15',
          hs_analytics_last_visit_timestamp: '2024-05-01',
          hs_sales_email_last_replied: '2024-02-01',
          num_contacted_notes: '5',
          hubspotscore: '75',
          hs_deal_amount: '25000',
        },
        createdAt: '2024-01-01',
        updatedAt: '2024-05-01',
      };

      const data = service.getContactEngagementData(contact);

      expect(data.contactId).toBe('1');
      expect(data.email).toBe('test@example.com');
      expect(data.name).toBe('John Doe');
      expect(data.company).toBe('Acme Corp');
      expect(data.daysSinceLastContact).toBe(92);
      expect(data.daysSinceLastOpen).toBe(61);
      expect(data.daysSinceLastClick).toBe(78);
      expect(data.daysSinceLastVisit).toBe(31);
      expect(data.daysSinceLastReply).toBe(121);
      expect(data.totalContactAttempts).toBe(5);
      expect(data.leadScore).toBe(75);
      expect(data.dealValue).toBe(25000);
    });

    it('should handle missing optional properties', () => {
      const contact: HubSpotContact = {
        id: '2',
        properties: {
          email: 'minimal@example.com',
        },
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };

      const data = service.getContactEngagementData(contact);

      expect(data.contactId).toBe('2');
      expect(data.email).toBe('minimal@example.com');
      expect(data.name).toBe('');
      expect(data.company).toBeNull();
      expect(data.daysSinceLastContact).toBeNull();
      expect(data.daysSinceLastOpen).toBeNull();
      expect(data.leadScore).toBe(0);
      expect(data.dealValue).toBe(0);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle very old dates correctly', () => {
      const now = new Date('2024-06-01');
      jest.useFakeTimers().setSystemTime(now);

      const contact: HubSpotContact = {
        id: '1',
        properties: {
          email: 'old@example.com',
          notes_last_contacted: '2020-01-01', // Over 4 years ago
        },
        createdAt: '2020-01-01',
        updatedAt: '2020-01-01',
      };

      const score = service.calculateDormancyScore(contact);

      // Should cap at maximum score
      expect(score.totalScore).toBeLessThanOrEqual(100);
      expect(score.factors.daysSinceLastContact).toBeGreaterThan(1000);
    });

    it('should handle future dates gracefully', () => {
      const now = new Date('2024-06-01');
      jest.useFakeTimers().setSystemTime(now);

      const contact: HubSpotContact = {
        id: '1',
        properties: {
          email: 'future@example.com',
          notes_last_contacted: '2025-01-01', // Future date
        },
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };

      const score = service.calculateDormancyScore(contact);

      // Future dates should result in 0 days or be treated as invalid
      expect(score.factors.daysSinceLastContact).toBeLessThanOrEqual(0);
      expect(score.totalScore).toBeLessThan(20);
    });

    it('should handle numeric string properties', () => {
      const contact: HubSpotContact = {
        id: '1',
        properties: {
          email: 'numeric@example.com',
          hubspotscore: '85.5',
          hs_deal_amount: '99999.99',
          num_contacted_notes: '10',
        },
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };

      const data = service.getContactEngagementData(contact);

      expect(data.leadScore).toBe(85.5);
      expect(data.dealValue).toBe(99999.99);
      expect(data.totalContactAttempts).toBe(10);
    });

    it('should handle non-numeric string values for numeric fields', () => {
      const contact: HubSpotContact = {
        id: '1',
        properties: {
          email: 'invalid@example.com',
          hubspotscore: 'not-a-number',
          hs_deal_amount: 'N/A',
        },
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };

      const data = service.getContactEngagementData(contact);

      expect(data.leadScore).toBe(0);
      expect(data.dealValue).toBe(0);
    });
  });
});
