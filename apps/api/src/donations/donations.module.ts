import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module.js';
import { DonationsController } from './donations.controller.js';
import { DonationsService } from './donations.service.js';

@Module({
  imports: [PaymentsModule],
  controllers: [DonationsController],
  providers: [DonationsService],
  exports: [DonationsService],
})
export class DonationsModule {}
