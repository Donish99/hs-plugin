import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Logger } from '@nestjs/common';
import { AccountId } from '../../common/decorators/account.decorator';
import {
  DormancyRulesService,
  CreateDormancyRuleDto,
  UpdateDormancyRuleDto,
} from '../services/dormancy-rules.service';
import { DormancyRule } from '../../entities/dormancy-rule.entity';

@Controller('api/accounts/:accountId/rules')
export class RulesController {
  private readonly logger = new Logger(RulesController.name);

  constructor(private readonly rulesService: DormancyRulesService) {}

  /**
   * Create a new dormancy rule
   */
  @Post()
  async create(
    @AccountId() accountId: string,
    @Body() createDto: CreateDormancyRuleDto,
  ): Promise<DormancyRule> {
    this.logger.log(`Creating rule for account ${accountId}`);
    return this.rulesService.create(accountId, createDto);
  }

  /**
   * Get all dormancy rules for an account
   */
  @Get()
  async findAll(@AccountId() accountId: string): Promise<DormancyRule[]> {
    return this.rulesService.findAll(accountId);
  }

  /**
   * Get a single dormancy rule
   */
  @Get(':ruleId')
  async findOne(
    @AccountId() accountId: string,
    @Param('ruleId') ruleId: string,
  ): Promise<DormancyRule> {
    return this.rulesService.findOne(accountId, ruleId);
  }

  /**
   * Update a dormancy rule
   */
  @Put(':ruleId')
  async update(
    @AccountId() accountId: string,
    @Param('ruleId') ruleId: string,
    @Body() updateDto: UpdateDormancyRuleDto,
  ): Promise<DormancyRule> {
    this.logger.log(`Updating rule ${ruleId} for account ${accountId}`);
    return this.rulesService.update(accountId, ruleId, updateDto);
  }

  /**
   * Delete a dormancy rule
   */
  @Delete(':ruleId')
  async delete(
    @AccountId() accountId: string,
    @Param('ruleId') ruleId: string,
  ): Promise<void> {
    this.logger.log(`Deleting rule ${ruleId} for account ${accountId}`);
    return this.rulesService.delete(accountId, ruleId);
  }

  /**
   * Toggle the active status of a rule
   */
  @Patch(':ruleId/toggle')
  async toggleActive(
    @AccountId() accountId: string,
    @Param('ruleId') ruleId: string,
  ): Promise<DormancyRule> {
    return this.rulesService.toggleActive(accountId, ruleId);
  }
}
