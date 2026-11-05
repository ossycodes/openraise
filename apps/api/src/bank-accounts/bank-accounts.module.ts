import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module.js';
import { BankAccountsController, BanksController } from './bank-accounts.controller.js';
import { BankAccountsService } from './bank-accounts.service.js';

@Module({
  imports: [PaymentsModule],
  controllers: [BanksController, BankAccountsController],
  providers: [BankAccountsService],
  exports: [BankAccountsService],
})
export class BankAccountsModule {}
