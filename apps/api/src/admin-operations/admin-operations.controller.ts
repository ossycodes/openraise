import { AdminMoneyActionsService } from './admin-money-actions.service.js';
import {
  moneyActionSchema,
  type MoneyAction,
} from './admin-operations.schemas.js';
import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AdminOperationsService } from './admin-operations.service.js';
import {
  adminListSchema,
  userActionSchema,
  campaignActionSchema,
  type AdminList,
  type UserAction,
  type CampaignAction,
} from './admin-operations.schemas.js';
import { SettingsService } from '../settings/settings.service.js';
import {
  saveSettingsSchema,
  type SaveSettings,
} from '../settings/settings.schemas.js';
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminOperationsController {
  constructor(
    private readonly ops: AdminOperationsService,
    private readonly settings: SettingsService,
    private readonly money: AdminMoneyActionsService,
  ) {}
  @Get('categories') @Header('Cache-Control', 'no-store') categories() {
    return this.ops.categories();
  }
  @Get('users') @Header('Cache-Control', 'no-store') users(
    @Query(new ZodValidationPipe(adminListSchema)) q: AdminList,
  ) {
    return this.ops.users(q);
  }
  @Get('users/:id') @Header('Cache-Control', 'no-store') async user(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
  ) {
    return { ...(await this.ops.user(id)), canManageAccess: actor.id !== id };
  }
  @Post('users/:id/actions')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  userAction(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(userActionSchema)) input: UserAction,
  ) {
    return this.ops.userAction(user, id, input);
  }
  @Post('campaigns/:id/actions')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  campaignAction(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(campaignActionSchema)) input: CampaignAction,
  ) {
    return this.ops.campaignAction(user, id, input);
  }
  @Post('money/reconciliation/:kind/:id/actions')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  moneyAction(
    @CurrentUser() user: AuthUser,
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(moneyActionSchema)) input: MoneyAction,
  ) {
    return this.money.action(user, kind, id, input);
  }
  @Get('settings') @Header('Cache-Control', 'no-store') configuration() {
    return this.settings.get();
  }
  @Post('settings')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  saveSettings(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(saveSettingsSchema)) input: SaveSettings,
  ) {
    return this.settings.save(user.id, input);
  }
}
