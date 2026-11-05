import { validateEntries } from '../ledger/ledger.entries.js';
import {
  withdrawalHold,
  withdrawalReverse,
  withdrawalSettle,
} from './withdrawal.entries.js';
describe('withdrawal accounting', () => {
  it.each([0n, 5000n])(
    'conserves money through holds, settlements and returned payouts with fee %s',
    (fee) => {
      const fees = { amount: 2000000n, fee, netPaidOut: 2000000n - fee };
      const hold = withdrawalHold('campaign', 'NGN', fees.amount);
      const settle = withdrawalSettle('NGN', fees);
      const failed = withdrawalReverse('campaign', 'NGN', fees, false);
      const reversed = withdrawalReverse('campaign', 'NGN', fees, true);
      for (const entries of [hold, settle, failed, reversed])
        expect(() => validateEntries('NGN', entries)).not.toThrow();
      const balances = (...postings: (typeof hold)[]) => {
        const map = new Map<string, bigint>();
        for (const entry of postings.flat())
          map.set(
            entry.account.type,
            (map.get(entry.account.type) ?? 0n) + entry.amount,
          );
        return map;
      };
      expect([...balances(hold, failed).values()].every((x) => x === 0n)).toBe(
        true,
      );
      expect(
        [...balances(hold, settle, reversed).values()].every((x) => x === 0n),
      ).toBe(true);
      const paid = balances(hold, settle);
      expect(paid.get('PENDING_PAYOUTS')).toBe(0n);
      expect(paid.get('CAMPAIGN_WALLET')).toBe(fees.amount);
      expect(paid.get('PROVIDER_CLEARING')).toBe(-fees.netPaidOut);
    },
  );
});
