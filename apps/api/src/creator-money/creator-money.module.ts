import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module.js';
import { CreatorMoneyController } from './creator-money.controller.js';
import { CreatorMoneyService } from './creator-money.service.js';

@Module({
  imports: [PaymentsModule],
  controllers: [CreatorMoneyController],
  providers: [CreatorMoneyService],
})
export class CreatorMoneyModule {}
