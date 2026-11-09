import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard.js';
import { KycModule } from '../kyc/kyc.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import {
  AdminNameReviewController,
  BankAccountsController,
  BanksController,
} from './bank-accounts.controller.js';
import { BankAccountsService } from './bank-accounts.service.js';
import { NameReviewService } from './name-review.js';

@Module({
  imports: [PaymentsModule, KycModule],
  controllers: [BanksController, BankAccountsController, AdminNameReviewController],
  providers: [BankAccountsService, NameReviewService, RolesGuard],
  exports: [BankAccountsService],
})
export class BankAccountsModule {}
