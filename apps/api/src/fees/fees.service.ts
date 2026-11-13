import { SettingsService } from '../settings/settings.service.js';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  computeDonationFees,
  computeWithdrawal,
  validateFeeConfig,
  type Currency,
  type DonationFees,
  type FeeConfig,
  type WithdrawalBreakdown,
} from '@openraise/shared';
import type { Env } from '../config/env.js';

/** Read the shared deployment settings for each new quote; persisted payments keep their snapshots. */
@Injectable()
export class FeesService {
  readonly currency: Currency;

  constructor(
    env: ConfigService<Env, true>,
    private readonly settings: SettingsService,
  ) {
    this.currency = env.get('DEFAULT_CURRENCY');
  }

  async snapshot(): Promise<FeeConfig> {
    const { values: v } = await this.settings.get();
    const config: FeeConfig = {
      platformFeeBps: v.platformFeeBps,
      donorFeeBps: v.donorFeeBps,
      donorFlatFee: BigInt(v.donorFlatFee),
      donorFlatFeeThreshold: BigInt(v.donorFlatFeeThreshold),
      withdrawalFee: BigInt(v.withdrawalFee),
    };
    validateFeeConfig(config);
    return config;
  }

  async donation(
    amount: bigint,
    options?: { donorCoversPlatformFee?: boolean },
  ): Promise<DonationFees> {
    return computeDonationFees(amount, await this.snapshot(), options);
  }

  async withdrawal(amount: bigint): Promise<WithdrawalBreakdown> {
    return computeWithdrawal(amount, await this.snapshot());
  }
}
