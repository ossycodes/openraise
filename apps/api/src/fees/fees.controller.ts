import { Controller, Get } from '@nestjs/common';
import { FeesService } from './fees.service.js';

export interface PublicFeeConfig {
  currency: string;
  platformFeeBps: number;
  donorFeeBps: number;
  /** Minor units, as strings so BigInt survives JSON. */
  donorFlatFee: string;
  donorFlatFeeThreshold: string;
  withdrawalFee: string;
}

/**
 * Every fee this deployment charges, public on purpose: donors and creators
 * should see all of them before they give or raise, including withdrawals.
 */
@Controller('config/fees')
export class FeesController {
  constructor(private readonly fees: FeesService) {}

  @Get()
  get(): PublicFeeConfig {
    const c = this.fees.config;
    return {
      currency: this.fees.currency,
      platformFeeBps: c.platformFeeBps,
      donorFeeBps: c.donorFeeBps,
      donorFlatFee: c.donorFlatFee.toString(),
      donorFlatFeeThreshold: c.donorFlatFeeThreshold.toString(),
      withdrawalFee: c.withdrawalFee.toString(),
    };
  }
}
