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

/** The deployment's fee settings, read once from env. */
@Injectable()
export class FeesService {
  readonly config: FeeConfig;
  readonly currency: Currency;

  constructor(env: ConfigService<Env, true>) {
    this.config = {
      platformFeeBps: env.get('PLATFORM_FEE_BPS'),
      donorFeeBps: env.get('DONOR_FEE_BPS'),
      donorFlatFee: env.get('DONOR_FLAT_FEE'),
      donorFlatFeeThreshold: env.get('DONOR_FLAT_FEE_THRESHOLD'),
      withdrawalFee: env.get('WITHDRAWAL_FEE'),
    };
    validateFeeConfig(this.config);
    this.currency = env.get('DEFAULT_CURRENCY');
  }

  donation(
    amount: bigint,
    options?: { donorCoversPlatformFee?: boolean },
  ): DonationFees {
    return computeDonationFees(amount, this.config, options);
  }

  withdrawal(amount: bigint): WithdrawalBreakdown {
    return computeWithdrawal(amount, this.config);
  }
}
