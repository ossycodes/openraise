import { Module } from '@nestjs/common';
import { KycModule } from '../kyc/kyc.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { WithdrawalEvents } from './withdrawal-events.js';
import { WithdrawalSettlement } from './withdrawal-settlement.js';
import {
  WithdrawalsController,
  PublicWithdrawalsController,
} from './withdrawals.controller.js';
import { WithdrawalsService } from './withdrawals.service.js';
@Module({
  imports: [PaymentsModule, KycModule],
  controllers: [WithdrawalsController, PublicWithdrawalsController],
  providers: [WithdrawalsService, WithdrawalSettlement, WithdrawalEvents],
  exports: [WithdrawalEvents, WithdrawalSettlement, WithdrawalsService],
})
export class WithdrawalsModule {}
