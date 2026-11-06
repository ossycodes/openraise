import { Module } from '@nestjs/common';
import { KycModule } from '../kyc/kyc.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { BankAccountsController, BanksController } from './bank-accounts.controller.js';
import { BankAccountsService } from './bank-accounts.service.js';

@Module({
  imports: [PaymentsModule, KycModule],
  controllers: [BanksController, BankAccountsController],
  providers: [BankAccountsService],
  exports: [BankAccountsService],
})
export class BankAccountsModule {}
