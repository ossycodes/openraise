import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RolesGuard } from '../auth/roles.guard.js';
import type { Env } from '../config/env.js';
import { ManualKycProvider } from './adapters/manual.js';
import { AdminKycController, KycController } from './kyc.controller.js';
import { KYC_PROVIDER, type KycProvider } from './kyc-provider.js';
import { KycRetentionService, KycRetentionWorker } from './kyc-retention.js';
import { KycService } from './kyc.service.js';

export function createKycProvider(
  config: ConfigService<Env, true>,
): KycProvider {
  switch (config.get('KYC_PROVIDER', { infer: true })) {
    case 'manual':
      return new ManualKycProvider();
    default:
      throw new Error('Invalid KYC_PROVIDER');
  }
}

@Module({
  imports: [ConfigModule],
  controllers: [KycController, AdminKycController],
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
