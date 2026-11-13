import { WebhooksModule } from '../webhooks/webhooks.module.js';
import { WithdrawalsModule } from '../withdrawals/withdrawals.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { AdminMoneyActionsService } from './admin-money-actions.service.js';
import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard.js';
import { AdminOperationsController } from './admin-operations.controller.js';
import { AdminOperationsService } from './admin-operations.service.js';
@Module({
  imports: [WebhooksModule, WithdrawalsModule, PaymentsModule],
  controllers: [AdminOperationsController],
  providers: [AdminOperationsService, AdminMoneyActionsService, RolesGuard],
})
export class AdminOperationsModule {}
