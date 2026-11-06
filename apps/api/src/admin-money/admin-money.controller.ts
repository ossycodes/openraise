import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AdminMoneyService } from './admin-money.service.js';
import {
  moneyQuerySchema,
  reconciliationQuerySchema,
  reconciliationKindSchema,
  type MoneyQuery,
  type ReconciliationQuery,
} from './admin-money.schemas.js';
@Controller('admin/money')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminMoneyController {
  constructor(private readonly money: AdminMoneyService) {}
  @Get('summary') @Header('Cache-Control', 'no-store') summary() {
    return this.money.summary();
  }
  @Get('ledger') @Header('Cache-Control', 'no-store') ledger(
    @Query(new ZodValidationPipe(moneyQuerySchema)) q: MoneyQuery,
  ) {
    return this.money.ledger(q);
  }
  @Get('ledger/:id') @Header('Cache-Control', 'no-store') transaction(
    @Param('id') id: string,
  ) {
    return this.money.transaction(id);
  }
  @Get('reconciliation') @Header('Cache-Control', 'no-store') reconciliation(
    @Query(new ZodValidationPipe(reconciliationQuerySchema))
    q: ReconciliationQuery,
  ) {
    return this.money.reconciliation(q);
  }
  @Get('reconciliation/:kind/:id') @Header('Cache-Control', 'no-store') detail(
    @Param('kind', new ZodValidationPipe(reconciliationKindSchema))
    kind: string,
    @Param('id') id: string,
  ) {
    return this.money.reconciliationDetail(kind, id);
  }
}
