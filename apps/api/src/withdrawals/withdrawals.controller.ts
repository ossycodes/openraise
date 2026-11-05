import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { WithdrawalsService } from './withdrawals.service.js';
import {
  payoutFreezeSchema,
  withdrawalInputSchema,
  withdrawalListSchema,
  withdrawalQuoteSchema,
  type WithdrawalInput,
} from './withdrawals.schemas.js';
@Controller()
@UseGuards(JwtAuthGuard)
export class WithdrawalsController {
  constructor(private readonly withdrawals: WithdrawalsService) {}
  @Post('campaigns/:id/withdrawals/quote')
  @Header('Cache-Control', 'no-store')
  quote(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(withdrawalQuoteSchema))
    body: { amount: string },
  ) {
    return this.withdrawals.quote(user, id, body.amount);
  }
  @Post('campaigns/:id/withdrawals')
  @Header('Cache-Control', 'no-store')
  request(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(withdrawalInputSchema)) body: WithdrawalInput,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.withdrawals.request(user, id, body, key);
  }
  @Get('campaigns/:id/withdrawals')
  @Header('Cache-Control', 'no-store')
  list(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query(new ZodValidationPipe(withdrawalListSchema)) query: { page: number },
  ) {
    return this.withdrawals.list(user, id, query.page);
  }
  @Get('withdrawals/:id')
  @Header('Cache-Control', 'no-store')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.withdrawals.get(user, id);
  }
  @Get('admin/withdrawals/review')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Header('Cache-Control', 'no-store')
  review(
    @Query(new ZodValidationPipe(withdrawalListSchema)) query: { page: number },
  ) {
    return this.withdrawals.reviewQueue(query.page);
  }
  @Put('admin/campaigns/:id/payout-freeze')
  @Header('Cache-Control', 'no-store')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  freeze(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(payoutFreezeSchema))
    body: { frozen: boolean; reason: string },
  ) {
    return this.withdrawals.freeze(user, id, body.frozen, body.reason);
  }
}

@Controller('campaigns')
export class PublicWithdrawalsController {
  constructor(private readonly withdrawals: WithdrawalsService) {}
  @Get(':slug/money-trail/withdrawals')
  @Header('Cache-Control', 'no-store')
  history(
    @Param('slug') slug: string,
    @Query(new ZodValidationPipe(withdrawalListSchema)) query: { page: number },
  ) {
    return this.withdrawals.publicHistory(slug, query.page);
  }
}
