/**
 * Fee maths shared by the API and the web app, so the donate form and the
 * ledger can never disagree. All amounts are BigInt minor units (kobo,
 * cents). Percentages are basis points: 350 bps = 3.5%.
 */

export interface FeeConfig {
  /** Taken from each donation before it reaches the campaign. */
  platformFeeBps: number;
  /** Payment-processing fee the donor pays on top of the donation. */
  donorFeeBps: number;
  /** Flat amount added to the donor fee when the charge is above the threshold. */
  donorFlatFee: bigint;
  donorFlatFeeThreshold: bigint;
  /** Flat fee per withdrawal, deducted from the amount paid out. */
  withdrawalFee: bigint;
}

/** Defaults for NGN deployments: 3.5% platform, 1.5% + ₦100 above ₦2,500, ₦50 per withdrawal. */
export const DEFAULT_FEE_CONFIG: FeeConfig = {
  platformFeeBps: 350,
  donorFeeBps: 150,
  donorFlatFee: 10_000n,
  donorFlatFeeThreshold: 250_000n,
  withdrawalFee: 5_000n,
};

export interface DonationFees {
  /** What the donor chose to give. */
  amount: bigint;
  platformFee: bigint;
  donorFee: bigint;
  /** What the payment provider charges the donor. */
  totalCharged: bigint;
  /** What lands in the campaign wallet. */
  netToCampaign: bigint;
  donorCoversPlatformFee: boolean;
}

export interface WithdrawalBreakdown {
  amount: bigint;
  fee: bigint;
  netPaidOut: bigint;
}

const BPS_DENOMINATOR = 10_000n;

export function validateFeeConfig(config: FeeConfig): void {
  for (const key of ['platformFeeBps', 'donorFeeBps'] as const) {
    const bps = config[key];
    if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) {
      throw new RangeError(`${key} must be an integer from 0 to 10000`);
    }
  }
  for (const key of [
    'donorFlatFee',
    'donorFlatFeeThreshold',
    'withdrawalFee',
  ] as const) {
    if (config[key] < 0n) throw new RangeError(`${key} must not be negative`);
  }
}

/** `bps` basis points of `amount`, rounded half up to the nearest minor unit. */
export function percentOf(amount: bigint, bps: number): bigint {
  if (amount < 0n) throw new RangeError('amount must not be negative');
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) {
    throw new RangeError('bps must be an integer from 0 to 10000');
  }
  return (amount * BigInt(bps) + BPS_DENOMINATOR / 2n) / BPS_DENOMINATOR;
}

/**
 * Break a donation into what the donor pays and what the campaign receives.
 *
 * The platform fee comes out of the donation unless the donor chooses to
 * cover it, in which case it's added to their charge and the campaign gets
 * the full amount. The donor processing fee is charged on top, on whatever
 * goes to the processor before that fee.
 */
export function computeDonationFees(
  amount: bigint,
  config: FeeConfig,
  options: { donorCoversPlatformFee?: boolean } = {},
): DonationFees {
  if (amount <= 0n) throw new RangeError('amount must be positive');
  validateFeeConfig(config);

  const donorCoversPlatformFee = options.donorCoversPlatformFee ?? false;
  const platformFee = percentOf(amount, config.platformFeeBps);
  const base = donorCoversPlatformFee ? amount + platformFee : amount;
  const flat =
    base > config.donorFlatFeeThreshold ? config.donorFlatFee : 0n;
  const donorFee = percentOf(base, config.donorFeeBps) + flat;

  return {
    amount,
    platformFee,
    donorFee,
    totalCharged: base + donorFee,
    netToCampaign: donorCoversPlatformFee ? amount : amount - platformFee,
    donorCoversPlatformFee,
  };
}

/** What a creator receives when withdrawing `amount` from a wallet. */
export function computeWithdrawal(
  amount: bigint,
  config: FeeConfig,
): WithdrawalBreakdown {
  validateFeeConfig(config);
  if (amount <= config.withdrawalFee) {
    throw new RangeError('withdrawal must be more than the withdrawal fee');
  }
  return {
    amount,
    fee: config.withdrawalFee,
    netPaidOut: amount - config.withdrawalFee,
  };
}
