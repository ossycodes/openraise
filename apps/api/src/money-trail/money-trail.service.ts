import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
@Injectable()
export class MoneyTrailService {
  constructor(private readonly prisma: PrismaService) {}
  async get(slug: string, page: number) {
    return this.prisma.$transaction(
      async (tx) => {
        const c = await tx.campaign.findFirst({
          where: { slug, status: { in: ['ACTIVE', 'PAUSED', 'ENDED'] } },
          select: { id: true, currency: true },
        });
        if (!c) throw new NotFoundException('Campaign not found');
        const sum = (transaction: Prisma.Sql, type: string, wallet = false) =>
          Prisma.sql`(SELECT COALESCE(SUM(e."amount"),0) FROM "LedgerEntry" e JOIN "LedgerAccount" a ON a."id"=e."accountId" WHERE e."transactionId"=${transaction} AND a."type"=${type}::"LedgerAccountType" AND a."currency"=${c.currency} ${wallet ? Prisma.sql`AND a."campaignId"=${c.id}` : Prisma.empty})`;
        const [gifts] = await tx.$queryRaw<
          {
            raised: string;
            fees: string;
            covered: string;
            received: string;
            count: bigint;
          }[]
        >`SELECT COALESCE(SUM(d."amount"),0)::text AS "raised",COALESCE(SUM(d."amount"-d."netToCampaign"),0)::text AS "fees",COALESCE(SUM(d."platformFee") FILTER (WHERE d."donorCoversPlatformFee"),0)::text AS "covered",COALESCE(SUM(d."netToCampaign"),0)::text AS "received",COUNT(*) AS "count" FROM "Donation" d JOIN "LedgerTransaction" t ON t."id"=d."ledgerTransactionId" AND t."kind"='DONATION' AND t."currency"=d."currency" WHERE d."campaignId"=${c.id} AND d."currency"=${c.currency} AND d."status"='SUCCEEDED' AND ${sum(Prisma.sql`t."id"`, 'CAMPAIGN_WALLET', true)}=-d."netToCampaign"`;
        const [wallet] = await tx.$queryRaw<
          { balance: string }[]
        >`SELECT (-COALESCE(SUM(e."amount"),0))::text AS "balance" FROM "LedgerEntry" e JOIN "LedgerAccount" a ON a."id"=e."accountId" WHERE a."campaignId"=${c.id} AND a."currency"=${c.currency} AND a."type"='CAMPAIGN_WALLET'`;
        const movements = Prisma.sql`WITH movements AS (SELECT w."id",w."amount",w."fee",w."netPaidOut",w."createdAt",h."createdAt" AS "reservedAt",s."createdAt" AS "settledAt",r."createdAt" AS "returnedAt",
   (h."id" IS NOT NULL AND ${sum(Prisma.sql`h."id"`, 'CAMPAIGN_WALLET', true)}=w."amount") AS reserved,
   (s."id" IS NOT NULL AND ${sum(Prisma.sql`s."id"`, 'PENDING_PAYOUTS')}=w."amount" AND ${sum(Prisma.sql`s."id"`, 'PROVIDER_CLEARING')}=-w."netPaidOut" AND ${sum(Prisma.sql`s."id"`, 'PLATFORM_REVENUE')}=-w."fee") AS settled,
   (r."id" IS NOT NULL AND ${sum(Prisma.sql`r."id"`, 'CAMPAIGN_WALLET', true)}=-w."amount") AS returned
   FROM "Withdrawal" w LEFT JOIN "LedgerTransaction" h ON h."id"=w."holdTransactionId" AND h."kind"='WITHDRAWAL_HOLD' AND h."currency"=w."currency" LEFT JOIN "LedgerTransaction" s ON s."id"=w."settlementTransactionId" AND s."kind"='WITHDRAWAL_SETTLE' AND s."currency"=w."currency" LEFT JOIN "LedgerTransaction" r ON r."id"=w."reversalTransactionId" AND r."kind"='WITHDRAWAL_REVERSE' AND r."currency"=w."currency" WHERE w."campaignId"=${c.id} AND w."currency"=${c.currency})`;
        const [transfers] = await tx.$queryRaw<
          {
            held: string;
            paid: string;
            fees: string;
            returned: string;
            count: bigint;
          }[]
        >`${movements} SELECT COALESCE(SUM("amount") FILTER (WHERE NOT settled AND NOT returned),0)::text AS held,COALESCE(SUM("netPaidOut") FILTER (WHERE settled AND NOT returned),0)::text AS paid,COALESCE(SUM("fee") FILTER (WHERE settled AND NOT returned),0)::text AS fees,COALESCE(SUM("amount") FILTER (WHERE returned),0)::text AS returned,COUNT(*) AS count FROM movements WHERE reserved`;
        const rows = await tx.$queryRaw<
          {
            id: string;
            amount: bigint;
            fee: bigint;
            netPaidOut: bigint;
            createdAt: Date;
            reservedAt: Date;
            settledAt: Date | null;
            returnedAt: Date | null;
            settled: boolean;
            returned: boolean;
          }[]
        >`${movements} SELECT "id","amount","fee","netPaidOut","createdAt","reservedAt","settledAt","returnedAt",settled,returned FROM movements WHERE reserved ORDER BY "createdAt" DESC,"id" DESC LIMIT 21 OFFSET ${(page - 1) * 20}`;
        const received = BigInt(gifts?.received ?? '0'),
          available = BigInt(wallet?.balance ?? '0'),
          held = BigInt(transfers?.held ?? '0'),
          paid = BigInt(transfers?.paid ?? '0'),
          fees = BigInt(transfers?.fees ?? '0');
        return {
          currency: c.currency,
          asOf: new Date(),
          raised: gifts?.raised ?? '0',
          platformFeesDeducted: gifts?.fees ?? '0',
          donorCoveredPlatformFees: gifts?.covered ?? '0',
          received: received.toString(),
          donationCount: Number(gifts?.count ?? 0n),
          walletBalance: available.toString(),
          reserved: held.toString(),
          paidOut: paid.toString(),
          withdrawalFeesPaid: fees.toString(),
          returned: transfers?.returned ?? '0',
          otherWalletChanges: (
            available +
            held +
            paid +
            fees -
            received
          ).toString(),
          withdrawals: {
            items: rows
              .slice(0, 20)
              .map((w) => ({
                id: w.id,
                amount: w.amount.toString(),
                fee: w.fee.toString(),
                netPaidOut: w.netPaidOut.toString(),
                state: w.returned
                  ? 'RETURNED'
                  : w.settled
                    ? 'PAID'
                    : 'IN_PROGRESS',
                requestedAt: w.createdAt,
                recordedAt: w.returned
                  ? w.returnedAt
                  : w.settled
                    ? w.settledAt
                    : w.reservedAt,
              })),
            page,
            hasMore: rows.length > 20,
            total: Number(transfers?.count ?? 0n),
          },
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
