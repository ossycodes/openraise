import { LedgerService } from '../ledger/ledger.service.js';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { normalSign } from '../ledger/ledger.entries.js';
import { withdrawalReviewWhere } from '../withdrawals/withdrawal-review.js';
import type { MoneyQuery, ReconciliationQuery } from './admin-money.schemas.js';
const campaignSelect = { id: true, title: true, slug: true } as const;
const donationSelect = {
  id: true,
  campaign: { select: campaignSelect },
  reference: true,
  provider: true,
  providerPaymentId: true,
  providerCheckoutId: true,
  currency: true,
  amount: true,
  totalCharged: true,
  platformFee: true,
  donorFee: true,
  netToCampaign: true,
  status: true,
  checkoutState: true,
  ledgerTransactionId: true,
  createdAt: true,
  updatedAt: true,
} as const;
const withdrawalSelect = {
  id: true,
  campaign: { select: campaignSelect },
  reference: true,
  provider: true,
  providerPayoutId: true,
  currency: true,
  amount: true,
  fee: true,
  netPaidOut: true,
  status: true,
  reconciliationRequired: true,
  reason: true,
  createdAt: true,
  updatedAt: true,
  bankName: true,
  accountLast4: true,
  holdTransactionId: true,
  settlementTransactionId: true,
  reversalTransactionId: true,
} as const;
const eventSelect = {
  id: true,
  provider: true,
  eventId: true,
  type: true,
  resourceId: true,
  reference: true,
  amount: true,
  currency: true,
  occurredAt: true,
  receivedAt: true,
  processedAt: true,
  outcome: true,
  reason: true,
} as const;
const donationReviewWhere = (now: Date): Prisma.DonationWhereInput => ({
  OR: [
    { status: 'PENDING', checkoutState: 'UNCERTAIN' },
    {
      status: 'PENDING',
      checkoutState: 'INITIALIZING',
      createdAt: { lt: new Date(now.getTime() - 60000) },
    },
    { status: 'SUCCEEDED', ledgerTransactionId: null },
  ],
});
const eventReviewWhere = (now: Date): Prisma.PaymentEventWhereInput => ({
  OR: [
    { outcome: 'REJECTED' },
    { processedAt: null, receivedAt: { lt: new Date(now.getTime() - 60000) } },
    {
      outcome: 'IGNORED',
      reason: {
        in: ['unknown-donation', 'unknown-withdrawal', 'missing-reference'],
      },
    },
  ],
});
const link = (id: string | null, label: string) => (id ? [{ id, label }] : []);
const amounts = (row: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(row).map(([key, v]) => [
      key,
      typeof v === 'bigint' ? v.toString() : v,
    ]),
  );
@Injectable()
export class AdminMoneyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
  ) {}
  async summary() {
    const now = new Date();
    return this.prisma.$transaction(
      async (tx) => {
        const balances = await tx.$queryRaw<
          {
            currency: string;
            type: Parameters<typeof normalSign>[0];
            sum: string;
          }[]
        >`SELECT a."currency",a."type",COALESCE(SUM(e."amount"),0)::text AS "sum" FROM "LedgerAccount" a LEFT JOIN "LedgerEntry" e ON e."accountId"=a."id" GROUP BY a."currency",a."type" ORDER BY a."currency",a."type"`;
        const [integrity] = await tx.$queryRaw<
          { count: bigint }[]
        >`SELECT COUNT(*) AS "count" FROM (SELECT t."id" FROM "LedgerTransaction" t LEFT JOIN "LedgerEntry" e ON e."transactionId"=t."id" LEFT JOIN "LedgerAccount" a ON a."id"=e."accountId" GROUP BY t."id" HAVING COUNT(e."id")<2 OR COALESCE(SUM(e."amount"),0)<>0 OR COUNT(*) FILTER (WHERE a."currency"<>t."currency")>0) broken`;
        return {
          asOf: now,
          transactionCount: await tx.ledgerTransaction.count(),
          unbalancedCount: Number(integrity?.count ?? 0n),
          balances: balances.map((r) => ({
            currency: r.currency,
            type: r.type,
            balance: (BigInt(r.sum) * normalSign(r.type)).toString(),
          })),
          review: {
            withdrawals: await tx.withdrawal.count({
              where: withdrawalReviewWhere(now),
            }),
            donations: await tx.donation.count({
              where: donationReviewWhere(now),
            }),
            events: await tx.paymentEvent.count({
              where: eventReviewWhere(now),
            }),
          },
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async ledger(query: MoneyQuery) {
    const where: Prisma.LedgerTransactionWhereInput = {
      ...(query.currency ? { currency: query.currency } : {}),
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.q
        ? {
            OR: [
              { id: { contains: query.q, mode: 'insensitive' } },
              { description: { contains: query.q, mode: 'insensitive' } },
              {
                donation: {
                  reference: { contains: query.q, mode: 'insensitive' },
                },
              },
              {
                withdrawalHold: {
                  reference: { contains: query.q, mode: 'insensitive' },
                },
              },
              {
                withdrawalSettlement: {
                  reference: { contains: query.q, mode: 'insensitive' },
                },
              },
              {
                withdrawalReversal: {
                  reference: { contains: query.q, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
      ...(query.campaignId
        ? {
            AND: [
              {
                OR: [
                  {
                    entries: {
                      some: { account: { campaignId: query.campaignId } },
                    },
                  },
                  { donation: { campaignId: query.campaignId } },
                  { withdrawalHold: { campaignId: query.campaignId } },
                  { withdrawalSettlement: { campaignId: query.campaignId } },
                  { withdrawalReversal: { campaignId: query.campaignId } },
                ],
              },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.ledgerTransaction.findMany({
        where,
        select: {
          id: true,
          kind: true,
          currency: true,
          description: true,
          createdAt: true,
          entries: { select: { amount: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * 20,
        take: 20,
      }),
      this.prisma.ledgerTransaction.count({ where }),
    ]);
    const campaign = query.campaignId
      ? await this.prisma.campaign.findUnique({
          where: { id: query.campaignId },
          select: { ...campaignSelect, currency: true },
        })
      : null;
    const wallet = campaign
      ? await this.ledgerService.campaignBalances(campaign.id)
      : [];
    if (campaign && !wallet.some((b) => b.currency === campaign.currency))
      wallet.push({ currency: campaign.currency, balance: 0n });
    return {
      campaignWallet: campaign
        ? {
            campaign,
            balances: wallet.map((b) => ({
              currency: b.currency,
              balance: b.balance.toString(),
            })),
          }
        : null,
      items: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        currency: r.currency,
        description: r.description,
        createdAt: r.createdAt,
        entryCount: r.entries.length,
        debits: r.entries
          .reduce((n, e) => n + (e.amount > 0n ? e.amount : 0n), 0n)
          .toString(),
        credits: r.entries
          .reduce((n, e) => n + (e.amount < 0n ? -e.amount : 0n), 0n)
          .toString(),
      })),
      total,
      page: query.page,
      limit: 20,
    };
  }
  async transaction(id: string) {
    const row = await this.prisma.ledgerTransaction.findUnique({
      where: { id },
      select: {
        id: true,
        kind: true,
        currency: true,
        description: true,
        createdAt: true,
        entries: {
          orderBy: { id: 'asc' },
          select: {
            id: true,
            amount: true,
            account: {
              select: {
                id: true,
                type: true,
                currency: true,
                campaign: { select: campaignSelect },
              },
            },
          },
        },
        donation: { select: { id: true, reference: true } },
        withdrawalHold: { select: { id: true, reference: true } },
        withdrawalSettlement: { select: { id: true, reference: true } },
        withdrawalReversal: { select: { id: true, reference: true } },
      },
    });
    if (!row) throw new NotFoundException('Ledger transaction not found');
    const sum = row.entries.reduce((n, e) => n + e.amount, 0n);
    return {
      ...row,
      entries: row.entries.map((e) => ({ ...e, amount: e.amount.toString() })),
      sum: sum.toString(),
      balanced:
        row.entries.length >= 2 &&
        sum === 0n &&
        row.entries.every((e) => e.account.currency === row.currency),
    };
  }
  async reconciliation(query: ReconciliationQuery) {
    const now = new Date(),
      paging = {
        skip: (query.page - 1) * 20,
        take: 20,
        orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
      };
    if (query.kind === 'DONATION') {
      const where: Prisma.DonationWhereInput = {
        AND: [
          donationReviewWhere(now),
          {
            ...(query.currency ? { currency: query.currency } : {}),
            ...(query.campaignId ? { campaignId: query.campaignId } : {}),
            ...(query.q
              ? {
                  OR: [
                    { reference: { contains: query.q, mode: 'insensitive' } },
                    {
                      campaign: {
                        title: { contains: query.q, mode: 'insensitive' },
                      },
                    },
                  ],
                }
              : {}),
          },
        ],
      };
      const [rows, total] = await this.prisma.$transaction([
        this.prisma.donation.findMany({
          where,
          select: donationSelect,
          ...paging,
        }),
        this.prisma.donation.count({ where }),
      ]);
      return {
        items: rows.map((r) => ({
          id: r.id,
          kind: 'DONATION',
          reference: r.reference,
          provider: r.provider,
          currency: r.currency,
          amount: r.totalCharged.toString(),
          status: r.status === 'SUCCEEDED' ? 'MISSING_LEDGER' : r.checkoutState,
          reason:
            r.status === 'SUCCEEDED'
              ? 'settled-without-ledger'
              : r.checkoutState === 'UNCERTAIN'
                ? 'unknown-checkout-outcome'
                : 'stale-checkout-initialization',
          createdAt: r.createdAt,
          campaign: r.campaign,
        })),
        total,
        page: query.page,
        limit: 20,
      };
    }
    if (query.kind === 'WITHDRAWAL') {
      const where: Prisma.WithdrawalWhereInput = {
        AND: [
          query.scope === 'returned'
            ? { status: { in: ['FAILED', 'REVERSED'] } }
            : withdrawalReviewWhere(now),
          {
            ...(query.currency ? { currency: query.currency } : {}),
            ...(query.campaignId ? { campaignId: query.campaignId } : {}),
            ...(query.q
              ? {
                  OR: [
                    { reference: { contains: query.q, mode: 'insensitive' } },
                    {
                      campaign: {
                        title: { contains: query.q, mode: 'insensitive' },
                      },
                    },
                  ],
                }
              : {}),
          },
        ],
      };
      const [rows, total] = await this.prisma.$transaction([
        this.prisma.withdrawal.findMany({
          where,
          select: withdrawalSelect,
          ...paging,
        }),
        this.prisma.withdrawal.count({ where }),
      ]);
      return {
        items: rows.map((r) => ({
          id: r.id,
          kind: 'WITHDRAWAL',
          reference: r.reference,
          provider: r.provider,
          currency: r.currency,
          amount: r.amount.toString(),
          status: r.status,
          reason:
            r.reason ??
            (r.status === 'INITIALIZING'
              ? 'stale-payout-initialization'
              : 'payout-needs-review'),
          createdAt: r.createdAt,
          campaign: r.campaign,
        })),
        total,
        page: query.page,
        limit: 20,
      };
    }
    const where: Prisma.PaymentEventWhereInput = {
      AND: [
        eventReviewWhere(now),
        {
          ...(query.currency ? { currency: query.currency } : {}),
          ...(query.q
            ? {
                OR: [
                  { reference: { contains: query.q, mode: 'insensitive' } },
                  { eventId: { contains: query.q, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
      ],
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.paymentEvent.findMany({
        where,
        select: eventSelect,
        orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
        skip: paging.skip,
        take: 20,
      }),
      this.prisma.paymentEvent.count({ where }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        kind: 'EVENT',
        reference: r.reference ?? r.eventId,
        provider: r.provider,
        currency: r.currency,
        amount: r.amount?.toString() ?? null,
        status: r.outcome ?? 'UNPROCESSED',
        reason: r.reason ?? 'stalled-event-processing',
        createdAt: r.receivedAt,
        campaign: null,
      })),
      total,
      page: query.page,
      limit: 20,
    };
  }
  async reconciliationDetail(kind: string, id: string) {
    if (kind === 'DONATION') {
      const row = await this.prisma.donation.findUnique({
        where: { id },
        select: donationSelect,
      });
      if (!row) throw new NotFoundException('Donation not found');
      return {
        kind,
        ...amounts(row),
        ledgerLinks: link(row.ledgerTransactionId, 'Donation posting'),
      };
    }
    if (kind === 'WITHDRAWAL') {
      const row = await this.prisma.withdrawal.findUnique({
        where: { id },
        select: withdrawalSelect,
      });
      if (!row) throw new NotFoundException('Withdrawal not found');
      const { accountLast4, ...safe } = row;
      const freezes = await this.prisma.payoutFreezeEvent.findMany({
        where: { campaignId: row.campaign.id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 20,
        select: {
          id: true,
          frozen: true,
          reason: true,
          createdAt: true,
          actor: { select: { name: true } },
        },
      });
      const state = await this.prisma.campaign.findUniqueOrThrow({
        where: { id: row.campaign.id },
        select: { payoutsFrozen: true, payoutFreezeReason: true },
      });
      return {
        kind,
        ...amounts(safe),
        maskedAccountNumber: `•••• ${accountLast4}`,
        freezes,
        ...state,
        ledgerLinks: [
          ...link(row.holdTransactionId, 'Reservation'),
          ...link(row.settlementTransactionId, 'Settlement'),
          ...link(row.reversalTransactionId, 'Reversal'),
        ],
      };
    }
    const row = await this.prisma.paymentEvent.findUnique({
      where: { id },
      select: eventSelect,
    });
    if (!row) throw new NotFoundException('Payment event not found');
    const donationMatch: Prisma.DonationWhereInput[] = [
      ...(row.reference ? [{ reference: row.reference }] : []),
      ...(row.resourceId
        ? [
            { providerPaymentId: row.resourceId },
            { providerCheckoutId: row.resourceId },
          ]
        : []),
    ];
    const withdrawalMatch: Prisma.WithdrawalWhereInput[] = [
      ...(row.reference ? [{ reference: row.reference }] : []),
      ...(row.resourceId ? [{ providerPayoutId: row.resourceId }] : []),
    ];
    const [donation, withdrawal] = await Promise.all([
      donationMatch.length
        ? this.prisma.donation.findFirst({
            where: { provider: row.provider, OR: donationMatch },
            select: { id: true, reference: true },
          })
        : null,
      withdrawalMatch.length
        ? this.prisma.withdrawal.findFirst({
            where: { provider: row.provider, OR: withdrawalMatch },
            select: { id: true, reference: true },
          })
        : null,
    ]);
    return {
      kind,
      ...amounts(row),
      ledgerLinks: [],
      relatedRecords: [
        ...(donation ? [{ ...donation, kind: 'DONATION' }] : []),
        ...(withdrawal ? [{ ...withdrawal, kind: 'WITHDRAWAL' }] : []),
      ],
    };
  }
}
