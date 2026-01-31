import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DormancyRule,
  DormancyCriteria,
  ActionType,
  ActionConfig,
} from '../../entities/dormancy-rule.entity';

export interface CreateDormancyRuleDto {
  name: string;
  criteria: DormancyCriteria;
  actionType: ActionType;
  actionConfig: ActionConfig;
  isActive?: boolean;
}

export interface UpdateDormancyRuleDto {
  name?: string;
  criteria?: DormancyCriteria;
  actionType?: ActionType;
  actionConfig?: ActionConfig;
  isActive?: boolean;
}

@Injectable()
export class DormancyRulesService {
  private readonly logger = new Logger(DormancyRulesService.name);

  constructor(
    @InjectRepository(DormancyRule)
    private readonly ruleRepository: Repository<DormancyRule>,
  ) {}

  /**
   * Create a new dormancy rule
   */
  async create(
    accountId: string,
    dto: CreateDormancyRuleDto,
  ): Promise<DormancyRule> {
    this.validateCriteria(dto.criteria);

    const rule = this.ruleRepository.create({
      accountId,
      name: dto.name,
      criteria: dto.criteria,
      actionType: dto.actionType,
      actionConfig: dto.actionConfig,
      isActive: dto.isActive ?? true,
    });

    const saved = await this.ruleRepository.save(rule);
    this.logger.log(`Created dormancy rule ${saved.id} for account ${accountId}`);

    return saved;
  }

  /**
   * Get all dormancy rules for an account
   */
  async findAll(accountId: string): Promise<DormancyRule[]> {
    return this.ruleRepository.find({
      where: { accountId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get only active rules for an account
   */
  async findActive(accountId: string): Promise<DormancyRule[]> {
    return this.ruleRepository.find({
      where: { accountId, isActive: true },
    });
  }

  /**
   * Get a single rule by ID (with multi-tenant check)
   */
  async findOne(accountId: string, ruleId: string): Promise<DormancyRule> {
    const rule = await this.ruleRepository.findOne({
      where: { id: ruleId, accountId },
    });

    if (!rule) {
      throw new NotFoundException(`Dormancy rule ${ruleId} not found`);
    }

    return rule;
  }

  /**
   * Update an existing rule
   */
  async update(
    accountId: string,
    ruleId: string,
    dto: UpdateDormancyRuleDto,
  ): Promise<DormancyRule> {
    const rule = await this.findOne(accountId, ruleId);

    if (dto.criteria) {
      this.validateCriteria(dto.criteria);
    }

    // Merge updates
    if (dto.name !== undefined) rule.name = dto.name;
    if (dto.criteria !== undefined) rule.criteria = dto.criteria;
    if (dto.actionType !== undefined) rule.actionType = dto.actionType;
    if (dto.actionConfig !== undefined) rule.actionConfig = dto.actionConfig;
    if (dto.isActive !== undefined) rule.isActive = dto.isActive;

    const saved = await this.ruleRepository.save(rule);
    this.logger.log(`Updated dormancy rule ${ruleId}`);

    return saved;
  }

  /**
   * Delete a rule
   */
  async delete(accountId: string, ruleId: string): Promise<void> {
    // Verify rule exists and belongs to account
    await this.findOne(accountId, ruleId);

    await this.ruleRepository.delete({
      id: ruleId,
      accountId,
    });

    this.logger.log(`Deleted dormancy rule ${ruleId}`);
  }

  /**
   * Toggle the active status of a rule
   */
  async toggleActive(accountId: string, ruleId: string): Promise<DormancyRule> {
    const rule = await this.findOne(accountId, ruleId);
    rule.isActive = !rule.isActive;

    const saved = await this.ruleRepository.save(rule);
    this.logger.log(
      `Toggled dormancy rule ${ruleId} to ${saved.isActive ? 'active' : 'inactive'}`,
    );

    return saved;
  }

  /**
   * Count rules for an account
   */
  async count(accountId: string): Promise<number> {
    return this.ruleRepository.count({
      where: { accountId },
    });
  }

  /**
   * Validate dormancy criteria
   */
  private validateCriteria(criteria: DormancyCriteria): void {
    // Must have at least one condition
    const hasCondition =
      criteria.min_days_inactive !== undefined ||
      criteria.no_email_opens_days !== undefined ||
      criteria.no_email_clicks_days !== undefined ||
      criteria.no_website_visits_days !== undefined ||
      criteria.deal_stages?.length ||
      criteria.min_lead_score !== undefined;

    if (!hasCondition) {
      throw new BadRequestException(
        'Dormancy criteria must have at least one condition',
      );
    }

    // Validate numeric values are positive
    if (
      criteria.min_days_inactive !== undefined &&
      criteria.min_days_inactive <= 0
    ) {
      throw new BadRequestException('min_days_inactive must be positive');
    }

    if (
      criteria.no_email_opens_days !== undefined &&
      criteria.no_email_opens_days <= 0
    ) {
      throw new BadRequestException('no_email_opens_days must be positive');
    }

    if (
      criteria.no_email_clicks_days !== undefined &&
      criteria.no_email_clicks_days <= 0
    ) {
      throw new BadRequestException('no_email_clicks_days must be positive');
    }

    if (
      criteria.no_website_visits_days !== undefined &&
      criteria.no_website_visits_days <= 0
    ) {
      throw new BadRequestException('no_website_visits_days must be positive');
    }

    // Validate lead score is 0-100
    if (
      criteria.min_lead_score !== undefined &&
      (criteria.min_lead_score < 0 || criteria.min_lead_score > 100)
    ) {
      throw new BadRequestException('min_lead_score must be between 0 and 100');
    }
  }
}
