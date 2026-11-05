import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { BachsProvider } from './adapters/bachs.js';
import { PaystackProvider } from './adapters/paystack.js';
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment-provider.js';

/** Null means payments are disabled; consumers must reject checkout in this state. */
export function createPaymentProvider(
  config: ConfigService<Env, true>,
): PaymentProvider | null {
  switch (config.get('PAYMENT_PROVIDER', { infer: true })) {
    case 'paystack':
      return new PaystackProvider(
        config.getOrThrow('PAYSTACK_SECRET_KEY', { infer: true }),
      );
    case 'bachs':
      return new BachsProvider(
        config.getOrThrow('BACHS_SECRET_KEY', { infer: true }),
        config.getOrThrow('BACHS_WEBHOOK_SECRET', { infer: true }),
        config.get('BACHS_BASE_URL', { infer: true }),
      );
    case 'disabled':
      return null;
    default:
      throw new Error('Invalid PAYMENT_PROVIDER');
  }
}

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: PAYMENT_PROVIDER,
      useFactory: createPaymentProvider,
      inject: [ConfigService],
    },
  ],
  exports: [PAYMENT_PROVIDER],
})
export class PaymentsModule {}
