import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RolesGuard } from '../auth/roles.guard.js';
import type { Env } from '../config/env.js';
import { DojahKycProvider } from './adapters/dojah.js';
import { ManualKycProvider } from './adapters/manual.js';
import { QoreIdKycProvider } from './adapters/qoreid.js';
import { SmileKycProvider } from './adapters/smile.js';
import { AdminKycController, KycController } from './kyc.controller.js';
import { KYC_PROVIDER, type KycProvider } from './kyc-provider.js';
import { KycRetentionService, KycRetentionWorker } from './kyc-retention.js';
import { KycService } from './kyc.service.js';
import { SmileWebhookController } from './smile-webhook.controller.js';

export function createKycProvider(
  config: ConfigService<Env, true>,
): KycProvider {
  switch (config.get('KYC_PROVIDER', { infer: true })) {
    case 'manual':
      return new ManualKycProvider();
    case 'qoreid':
      return new QoreIdKycProvider(
        config.getOrThrow('QOREID_CLIENT_ID', { infer: true }),
        config.getOrThrow('QOREID_SECRET', { infer: true }),
        config.get('QOREID_BASE_URL', { infer: true }),
      );
    case 'dojah':
      return new DojahKycProvider(
        config.getOrThrow('DOJAH_APP_ID', { infer: true }),
        config.getOrThrow('DOJAH_SECRET_KEY', { infer: true }),
        config.get('DOJAH_BASE_URL', { infer: true }),
      );
    case 'smile':
      return new SmileKycProvider(
        config.getOrThrow('SMILE_PARTNER_ID', { infer: true }),
        config.getOrThrow('SMILE_API_KEY', { infer: true }),
        config.get('SMILE_BASE_URL', { infer: true }),
        config.getOrThrow('SMILE_CALLBACK_URL', { infer: true }),
        undefined,
        config.getOrThrow('SMILE_PRIVACY_POLICY_URL', { infer: true }),
      );
    default:
      throw new Error('Invalid KYC_PROVIDER');
  }
}

@Module({
  imports: [ConfigModule],
  controllers: [KycController, AdminKycController, SmileWebhookController],
  providers: [
    KycService,
    KycRetentionService,
    KycRetentionWorker,
    RolesGuard,
    {
      provide: KYC_PROVIDER,
      useFactory: createKycProvider,
      inject: [ConfigService],
    },
  ],
  exports: [KycService, KycRetentionService],
})
export class KycModule {}
