import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { PaymentEventProcessor } from './payment-event.processor.js';
import { PaymentEventQueue } from './payment-event.queue.js';
import { WebhooksController } from './webhooks.controller.js';
import { WebhooksService } from './webhooks.service.js';
@Module({
  imports: [PaymentsModule, LedgerModule],
  controllers: [WebhooksController],
  providers: [WebhooksService, PaymentEventProcessor, PaymentEventQueue],
})
export class WebhooksModule {}
