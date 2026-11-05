import { describe, expect, it } from 'vitest';
import {
  computeDonationFees,
  computeWithdrawal,
  DEFAULT_FEE_CONFIG,
  percentOf,
  validateFeeConfig,
  type FeeConfig,
} from './fees.js';

const naira = (n: number) => BigInt(n) * 100n;

describe('percentOf', () => {
  it('takes basis points', () => {
    expect(percentOf(naira(50_000), 350)).toBe(naira(1_750));
  });

  it('rounds half up to the nearest minor unit', () => {
    expect(percentOf(150n, 350)).toBe(5n); // 5.25 -> 5
    expect(percentOf(100n, 350)).toBe(4n); // 3.5  -> 4
    expect(percentOf(1n, 150)).toBe(0n); // 0.015 -> 0
  });

  it('rejects bad input', () => {
    expect(() => percentOf(-1n, 100)).toThrow(RangeError);
    expect(() => percentOf(1n, 1.5)).toThrow(RangeError);
    expect(() => percentOf(1n, 10_001)).toThrow(RangeError);
  });
});

describe('computeDonationFees', () => {
  it('takes the platform fee from a ₦50,000 donation', () => {
    const f = computeDonationFees(naira(50_000), DEFAULT_FEE_CONFIG);
    expect(f.platformFee).toBe(naira(1_750));
    expect(f.netToCampaign).toBe(naira(48_250));
    // 1.5% of ₦50,000 = ₦750, plus ₦100 because it's above ₦2,500
    expect(f.donorFee).toBe(naira(850));
    expect(f.totalCharged).toBe(naira(50_850));
  });

  it('skips the flat fee at or below the threshold', () => {
    const at = computeDonationFees(naira(2_500), DEFAULT_FEE_CONFIG);
    expect(at.donorFee).toBe(3_750n); // 1.5% of ₦2,500 = ₦37.50
    const above = computeDonationFees(naira(2_500) + 1n, DEFAULT_FEE_CONFIG);
    expect(above.donorFee).toBe(3_750n + naira(100));
  });

  it('lets the donor cover the platform fee', () => {
    const f = computeDonationFees(naira(10_000), DEFAULT_FEE_CONFIG, {
      donorCoversPlatformFee: true,
    });
    expect(f.netToCampaign).toBe(naira(10_000));
    expect(f.platformFee).toBe(naira(350));
    // processing is charged on ₦10,350: 1.5% = ₦155.25, + ₦100
    expect(f.donorFee).toBe(15_525n + naira(100));
    expect(f.totalCharged).toBe(naira(10_350) + f.donorFee);
  });

  it('balances: charged = net + platform fee + donor fee', () => {
    for (const amount of [1n, 99n, 250_000n, 250_001n, naira(3_000_000)]) {
      for (const cover of [false, true]) {
        const f = computeDonationFees(amount, DEFAULT_FEE_CONFIG, {
          donorCoversPlatformFee: cover,
        });
        expect(f.totalCharged).toBe(
          f.netToCampaign + f.platformFee + f.donorFee,
        );
      }
    }
  });

  it('supports a fee-free deployment', () => {
    const free: FeeConfig = {
      platformFeeBps: 0,
      donorFeeBps: 0,
      donorFlatFee: 0n,
      donorFlatFeeThreshold: 0n,
      withdrawalFee: 0n,
    };
    const f = computeDonationFees(naira(1_000), free);
    expect(f.totalCharged).toBe(naira(1_000));
    expect(f.netToCampaign).toBe(naira(1_000));
  });

  it('rejects zero and negative donations', () => {
    expect(() => computeDonationFees(0n, DEFAULT_FEE_CONFIG)).toThrow(
      RangeError,
    );
    expect(() => computeDonationFees(-5n, DEFAULT_FEE_CONFIG)).toThrow(
      RangeError,
    );
  });
});

describe('computeWithdrawal', () => {
  it('deducts the flat fee', () => {
    expect(computeWithdrawal(naira(20_000), DEFAULT_FEE_CONFIG)).toEqual({
      amount: naira(20_000),
      fee: naira(50),
      netPaidOut: naira(19_950),
    });
  });

  it('refuses a withdrawal the fee would swallow', () => {
    expect(() => computeWithdrawal(naira(50), DEFAULT_FEE_CONFIG)).toThrow(
      RangeError,
    );
  });
});

describe('validateFeeConfig', () => {
  it('rejects out-of-range values', () => {
    expect(() =>
      validateFeeConfig({ ...DEFAULT_FEE_CONFIG, platformFeeBps: -1 }),
    ).toThrow(/platformFeeBps/);
    expect(() =>
      validateFeeConfig({ ...DEFAULT_FEE_CONFIG, withdrawalFee: -1n }),
    ).toThrow(/withdrawalFee/);
  });
});
