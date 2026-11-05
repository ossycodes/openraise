import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from '../config/env.js';
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment-provider.js';
import { PaymentsModule } from './payments.module.js';

const required = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/openraise',
  JWT_SECRET: 'x'.repeat(32),
};

it.each(['disabled', 'paystack', 'bachs'] as const)(
  'exports the configured %s provider through Nest injection',
  async (provider) => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          skipProcessEnv: true,
          load: [
            () =>
              validateEnv({
                ...required,
                PAYMENT_PROVIDER: provider,
                PAYSTACK_SECRET_KEY: 'sk_test_example',
                BACHS_SECRET_KEY: 'sk_sandbox_example',
                BACHS_WEBHOOK_SECRET: 'whsec_example',
              }),
          ],
        }),
        PaymentsModule,
      ],
    }).compile();
    try {
      const selected = module.get<PaymentProvider | null>(PAYMENT_PROVIDER);
      expect(selected?.name ?? 'disabled').toBe(provider);
    } finally {
      await module.close();
    }
  },
);
