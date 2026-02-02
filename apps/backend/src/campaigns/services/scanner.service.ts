import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { QueryBuilderService } from './query-builder.service';
import { DormancyRulesService } from './dormancy-rules.service';
import { ContactsService } from '../../hubspot/services/contacts.service';

export interface HubSpotContact {
  id: string;
  properties: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface ScanResult {
  ruleId: string;
  contacts: HubSpotContact[];
  totalFound: number;
  scannedAt: Date;
}

export interface ScanOptions {
  forceRefresh?: boolean;
  limit?: number;
  after?: string;
}

interface CacheEntry {
  result: ScanResult;
  expiresAt: number;
}

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class ScannerService {
  private readonly logger = new Logger(ScannerService.name);
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly queryBuilder: QueryBuilderService,
    private readonly rulesService: DormancyRulesService,
    private readonly contactsService: ContactsService,
  ) {}

  /**
   * Scan contacts matching a specific dormancy rule
   */
  async scanForRule(
    accountId: string,
    portalId: number,
    ruleId: string,
    options: ScanOptions = {},
  ): Promise<ScanResult> {
    const rule = await this.rulesService.findOne(accountId, ruleId);

    if (!rule) {
      throw new NotFoundException('Rule not found');
    }

    const cacheKey = this.queryBuilder.getCacheKey(accountId, rule.criteria);

    // Check cache unless forceRefresh is true
    if (!options.forceRefresh) {
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        this.logger.log(`Cache hit for rule ${ruleId}`);
        return cached;
      }
    }

    this.logger.log(`Scanning contacts for rule: ${rule.name} (${ruleId})`);

    const searchRequest = this.queryBuilder.buildSearchRequest(rule.criteria, {
      limit: options.limit,
      after: options.after,
    });

    try {
      const searchResponse = await this.contactsService.searchWithRequest(portalId, searchRequest);

      const result: ScanResult = {
        ruleId,
        contacts: searchResponse.contacts as HubSpotContact[],
        totalFound: searchResponse.total,
        scannedAt: new Date(),
      };

      // Cache the result
      this.setInCache(cacheKey, result);

      this.logger.log(`Found ${result.totalFound} contacts matching rule ${rule.name}`);

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to scan for rule ${ruleId}: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Scan all active rules for an account
   */
  async scanAllRules(
    accountId: string,
    portalId: number,
    options: ScanOptions = {},
  ): Promise<ScanResult[]> {
    const activeRules = await this.rulesService.findActive(accountId);

    if (activeRules.length === 0) {
      this.logger.log(`No active rules found for account ${accountId}`);
      return [];
    }

    this.logger.log(`Scanning ${activeRules.length} active rules for account ${accountId}`);

    const results: ScanResult[] = [];

    for (const rule of activeRules) {
      try {
        const result = await this.scanForRule(accountId, portalId, rule.id, options);
        results.push(result);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(
          `Failed to scan rule ${rule.id}: ${errorMessage}. Continuing with next rule.`,
        );
        // Continue with other rules even if one fails
      }
    }

    return results;
  }

  /**
   * Clear cache for a specific rule
   */
  async clearCache(accountId: string, ruleId: string): Promise<void> {
    const rule = await this.rulesService.findOne(accountId, ruleId);

    if (!rule) {
      return;
    }

    const cacheKey = this.queryBuilder.getCacheKey(accountId, rule.criteria);
    this.cache.delete(cacheKey);
    this.logger.log(`Cache cleared for rule ${ruleId}`);
  }

  /**
   * Clear all cached scan results
   */
  clearAllCache(): void {
    this.cache.clear();
    this.logger.log('All scan cache cleared');
  }

  /**
   * Get cached result if not expired
   */
  private getFromCache(key: string): ScanResult | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.result;
  }

  /**
   * Store result in cache with TTL
   */
  private setInCache(key: string, result: ScanResult): void {
    this.cache.set(key, {
      result,
      expiresAt: Date.now() + DEFAULT_CACHE_TTL_MS,
    });
  }
}
