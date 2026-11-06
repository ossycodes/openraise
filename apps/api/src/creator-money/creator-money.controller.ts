import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CreatorMoneyService } from './creator-money.service.js';

const pageSchema = z.coerce.number().int().min(1).max(10_000).default(1);

/** A campaign owner's view of the money: totals, donations and an export. */
@Controller('campaigns/:id')
@UseGuards(JwtAuthGuard)
export class CreatorMoneyController {
  constructor(private readonly money: CreatorMoneyService) {}

  @Get('money')
  @Header('Cache-Control', 'no-store')
  summary(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.money.summary(user, id);
  }

  // Declared before 'donations/received' so ".csv" isn't swallowed by it.
  @Get('donations/received.csv')
  @Header('Cache-Control', 'no-store')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="donations.csv"')
  csv(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.money.receivedCsv(user, id);
  }

  @Get('donations/received')
  @Header('Cache-Control', 'no-store')
  received(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('page', new ZodValidationPipe(pageSchema)) page: number,
  ) {
    return this.money.received(user, id, page);
  }
}
