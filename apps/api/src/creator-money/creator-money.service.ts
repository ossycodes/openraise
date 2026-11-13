import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { MINOR_UNITS, isCurrency } from '@openraise/shared';
import type { AuthUser } from '../auth/auth.types.js';
import { FeesService } from '../fees/fees.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { LedgerService } from '../ledger/ledger.service.js';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
} from '../payments/payment-provider.js';
import { PrismaService } from '../prisma/prisma.service.js';

const PAGE_SIZE = 25;
/** Withdrawals whose money is held but not yet settled or returned */
const IN_PROGRESS = ['INITIALIZING', 'PENDING', 'UNCERTAIN'] as const;

/**
 * What a creator sees about their campaign's money. Read only: every figure
 * comes from confirmed donations, withdrawals and the ledger. Donor-provided names and messages are visible only to the owner; email
 * addresses and account identifiers are not shared.
 */
@Injectable()
export class CreatorMoneyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly fees: FeesService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider | null,
  ) {}

  async summary(user: AuthUser, campaignId: string) {
    const c = await this.owned(user, campaignId);
    const [donations, balances, withdrawals] = await Promise.all([
      this.prisma.donation.aggregate({
        where: this.confirmed(c.id, c.currency),
        _sum: { amount: true, platformFee: true, netToCampaign: true },
        _count: true,
      }),
      this.ledger.campaignBalances(c.id),
      this.prisma.withdrawal.groupBy({
        by: ['status'],
        where: { campaignId: c.id },
        _sum: { amount: true, fee: true, netPaidOut: true },
      }),
    ]);
    const sum = (
      statuses: readonly string[],
      field: 'amount' | 'fee' | 'netPaidOut',
    ) =>
      withdrawals
        .filter((w) => statuses.includes(w.status))
        .reduce((total, w) => total + (w._sum[field] ?? 0n), 0n);
    return {
      currency: c.currency,
      donationCount: donations._count,
      /** Gross donations, as shown on the campaign page */
      raised: (donations._sum.amount ?? 0n).toString(),
      platformFees: (donations._sum.platformFee ?? 0n).toString(),
      /** What donations added to the campaign wallet */
      received: (donations._sum.netToCampaign ?? 0n).toString(),
      /** Wallet balance from the ledger: what can be withdrawn now */
      available: (
        balances.find((b) => b.currency === c.currency)?.balance ?? 0n
      ).toString(),
      withdrawalsInProgress: sum(IN_PROGRESS, 'amount').toString(),
      paidOut: sum(['SUCCEEDED'], 'netPaidOut').toString(),
      withdrawalFeesPaid: sum(['SUCCEEDED'], 'fee').toString(),
      withdrawalFee: (await this.fees.snapshot()).withdrawalFee.toString(),
      payoutsSupported: !!this.provider && c.currency === 'NGN',
      payoutsFrozen: c.payoutsFrozen,
      payoutFreezeReason: c.payoutFreezeReason,
    };
  }

  /** Confirmed donations, newest first. Amounts only; no donor identities. */
  async received(user: AuthUser, campaignId: string, page: number) {
    const c = await this.owned(user, campaignId);
    const rows = await this.prisma.donation.findMany({
      where: this.confirmed(c.id, c.currency),
      orderBy: [{ succeededAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE + 1,
      select: DONATION_FIELDS,
    });
    return {
      items: rows.slice(0, PAGE_SIZE).map(toReceived),
      page,
      hasMore: rows.length > PAGE_SIZE,
    };
  }

  /** Every confirmed donation as CSV, amounts in major units. */
  async receivedCsv(user: AuthUser, campaignId: string): Promise<string> {
    const c = await this.owned(user, campaignId);
    const rows = await this.prisma.donation.findMany({
      where: this.confirmed(c.id, c.currency),
      orderBy: [{ succeededAt: 'asc' }, { id: 'asc' }],
      select: DONATION_FIELDS,
    });
    const unit = BigInt(isCurrency(c.currency) ? MINOR_UNITS[c.currency] : 100);
    const decimal = (minor: bigint) => {
      const digits = unit.toString().length - 1;
      const whole = minor / unit;
      const frac = (minor % unit).toString().padStart(digits, '0');
      return digits ? `${whole}.${frac}` : whole.toString();
    };
    const lines = [
      'confirmed_at,donation_id,currency,amount,platform_fee,donor_fee,net_to_campaign',
      ...rows.map((d) =>
        [
          d.succeededAt?.toISOString() ?? '',
          d.id,
          d.currency,
          decimal(d.amount),
          decimal(d.platformFee),
          decimal(d.donorFee),
          decimal(d.netToCampaign),
        ].join(','),
      ),
    ];
    return `${lines.join('\r\n')}\r\n`;
  }

  /** Succeeded and posted to the ledger, the same rule as `raisedAmount`. */
  private confirmed(
    campaignId: string,
    currency: string,
  ): Prisma.DonationWhereInput {
    return {
      campaignId,
      currency,
      status: 'SUCCEEDED',
      ledgerTransactionId: { not: null },
    };
  }

  /** The campaign if `user` owns it; 404 otherwise, so ids can't be probed. */
  private async owned(user: AuthUser, campaignId: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, ownerId: user.id },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }
}

const DONATION_FIELDS = {
  id: true,
  currency: true,
  amount: true,
  platformFee: true,
  donorFee: true,
  netToCampaign: true,
  donorCoversPlatformFee: true,
  succeededAt: true,
  donorName: true,
  donorMessage: true,
  isAnonymous: true,
} satisfies Prisma.DonationSelect;

function toReceived(
  d: Prisma.DonationGetPayload<{ select: typeof DONATION_FIELDS }>,
) {
  return {
    id: d.id,
    currency: d.currency,
    amount: d.amount.toString(),
    platformFee: d.platformFee.toString(),
    donorFee: d.donorFee.toString(),
    netToCampaign: d.netToCampaign.toString(),
    donorCoveredPlatformFee: d.donorCoversPlatformFee,
    confirmedAt: d.succeededAt,
    donorName: d.donorName,
    donorMessage: d.donorMessage,
    isAnonymous: d.isAnonymous,
  };
}
