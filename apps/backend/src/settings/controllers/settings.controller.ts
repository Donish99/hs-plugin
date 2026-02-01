import {
  Controller,
  Get,
  Put,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AccountId } from '../../common/decorators/account.decorator';
import {
  SettingsService,
  AccountSettings,
  UpdateSettingsDto,
  SendingLimits,
  UpdateSendingLimitsDto,
  AiSettings,
  UpdateAiSettingsDto,
  NotificationPreferences,
  UpdateNotificationPreferencesDto,
} from '../services/settings.service';

@Controller('api/v1/accounts/:accountId/settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  /**
   * Get all account settings
   */
  @Get()
  async getSettings(@AccountId() accountId: string): Promise<AccountSettings> {
    return this.settingsService.getSettings(accountId);
  }

  /**
   * Update account settings
   */
  @Put()
  @HttpCode(HttpStatus.OK)
  async updateSettings(
    @AccountId() accountId: string,
    @Body() updates: UpdateSettingsDto,
  ): Promise<AccountSettings> {
    return this.settingsService.updateSettings(accountId, updates);
  }

  /**
   * Get sending limits
   */
  @Get('sending-limits')
  async getSendingLimits(@AccountId() accountId: string): Promise<SendingLimits> {
    return this.settingsService.getSendingLimits(accountId);
  }

  /**
   * Update sending limits
   */
  @Put('sending-limits')
  @HttpCode(HttpStatus.OK)
  async updateSendingLimits(
    @AccountId() accountId: string,
    @Body() updates: UpdateSendingLimitsDto,
  ): Promise<SendingLimits> {
    return this.settingsService.updateSendingLimits(accountId, updates);
  }

  /**
   * Get AI settings
   */
  @Get('ai')
  async getAiSettings(@AccountId() accountId: string): Promise<AiSettings> {
    return this.settingsService.getAiSettings(accountId);
  }

  /**
   * Update AI settings
   */
  @Put('ai')
  @HttpCode(HttpStatus.OK)
  async updateAiSettings(
    @AccountId() accountId: string,
    @Body() updates: UpdateAiSettingsDto,
  ): Promise<AiSettings> {
    return this.settingsService.updateAiSettings(accountId, updates);
  }

  /**
   * Get notification preferences
   */
  @Get('notifications')
  async getNotificationPreferences(
    @AccountId() accountId: string,
  ): Promise<NotificationPreferences> {
    return this.settingsService.getNotificationPreferences(accountId);
  }

  /**
   * Update notification preferences
   */
  @Put('notifications')
  @HttpCode(HttpStatus.OK)
  async updateNotificationPreferences(
    @AccountId() accountId: string,
    @Body() updates: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferences> {
    return this.settingsService.updateNotificationPreferences(accountId, updates);
  }
}
