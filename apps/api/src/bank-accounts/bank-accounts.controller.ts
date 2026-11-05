import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import type { Bank } from '../payments/payment-provider.js';
import {
  BankAccountsService,
  type AccountLookup,
  type PublicBankAccount,
} from './bank-accounts.service.js';

const lookupSchema = z.object({
  bankCode: z.string().trim().min(1).max(20),
  accountNumber: z
    .string()
    .trim()
    .regex(/^\d{10}$/, 'Enter the 10-digit account number'),
});

@Controller('banks')
@UseGuards(JwtAuthGuard)
export class BanksController {
  constructor(private readonly accounts: BankAccountsService) {}

  @Get()
  list(): Promise<Bank[]> {
    return this.accounts.listBanks();
  }
}

/** A user's payout accounts. Every route is the signed-in user's own. */
@Controller('bank-accounts')
@UseGuards(JwtAuthGuard)
export class BankAccountsController {
  constructor(private readonly accounts: BankAccountsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<PublicBankAccount[]> {
    return this.accounts.list(user);
  }

  /** Preview the account name before saving. */
  @Post('resolve')
  @HttpCode(HttpStatus.OK)
  resolve(@Body(new ZodValidationPipe(lookupSchema)) body: AccountLookup) {
    return this.accounts.resolve(body);
  }

  @Post()
  add(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(lookupSchema)) body: AccountLookup,
  ): Promise<PublicBankAccount> {
    return this.accounts.add(user, body);
  }

  @Put(':id/default')
  setDefault(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<PublicBankAccount[]> {
    return this.accounts.setDefault(user, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<PublicBankAccount[]> {
    return this.accounts.remove(user, id);
  }
}
