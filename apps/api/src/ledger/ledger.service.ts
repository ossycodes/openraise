import { Injectable } from '@nestjs/common';
import type { Currency } from '@openraise/shared';
import type { LedgerTransactionKind } from '../generated/prisma/client.js';
import { isUniqueViolation, PrismaService } from '../prisma/prisma.service.js';
import {
  accountKey,
  normalSign,
  validateEntries,
  type AccountRef,
  type EntryInput,
} from './ledger.entries.js';

export interface PostingInput {
  kind: LedgerTransactionKind;
  /** One per business event, e.g. "donation:<id>" */
  idempotencyKey: string;
  currency: Currency;
  description: string;
  entries: EntryInput[];
}

export interface PostingResult {
  transactionId: string;
  /** False when this key was already posted; nothing new was written */
  created: boolean;
}

export interface IntegrityReport {
  /** Transactions whose entries don't sum to zero. Must always be empty. */
  unbalancedTransactionIds: string[];
  /** Sum of every entry per currency. Must always be zero. */
  totalsByCurrency: Record<string, bigint>;
  ok: boolean;
}

/**
 * The only way money moves in OpenRaise. Postings are validated, written
 * atomically, and idempotent by key, so a webhook delivered twice can't
 * credit a campaign twice. Balances are computed from entries on demand.
 */
@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async post(input: PostingInput): Promise<PostingResult> {
    validateEntries(input.currency, input.entries);

    for (let attempt = 0; ; attempt++) {
      const existing = await this.prisma.ledgerTransaction.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        select: { id: true },
      });
      if (existing) return { transactionId: existing.id, created: false };

      try {
        const id = await this.prisma.$transaction(async (tx) => {
          const accountIds: string[] = [];
          for (const entry of input.entries) {
            const account = await tx.ledgerAccount.upsert({
              where: { key: accountKey(entry.account) },
              create: {
                key: accountKey(entry.account),
                type: entry.account.type,
                currency: entry.account.currency,
                campaignId: entry.account.campaignId ?? null,
              },
              update: {},
              select: { id: true },
            });
            accountIds.push(account.id);
          }
          const created = await tx.ledgerTransaction.create({
            data: {
              kind: input.kind,
              idempotencyKey: input.idempotencyKey,
              currency: input.currency,
              description: input.description,
              entries: {
                create: input.entries.map((e, i) => ({
                  accountId: accountIds[i]!,
                  amount: e.amount,
                })),
              },
            },
            select: { id: true },
          });
          return created.id;
        });
        return { transactionId: id, created: true };
      } catch (error) {
        // A concurrent posting with the same key (or a racing account
        // upsert) won. Loop: the lookup above returns the winner.
        if (!isUniqueViolation(error) || attempt >= 2) throw error;
      }
    }
  }

  /** Positive in the account's normal direction (what a wallet holds, what clearing has). */
  async balance(ref: AccountRef): Promise<bigint> {
    const account = await this.prisma.ledgerAccount.findUnique({
      where: { key: accountKey(ref) },
      select: { id: true },
    });
    if (!account) return 0n;
    const sum = await this.prisma.ledgerEntry.aggregate({
      where: { accountId: account.id },
      _sum: { amount: true },
    });
    return (sum._sum.amount ?? 0n) * normalSign(ref.type);
  }

  /** A campaign's wallet balance in each currency it has received. */
  async campaignBalances(campaignId: string): Promise<{ currency: string; balance: bigint }[]> {
    const rows = await this.prisma.$queryRaw<{ currency: string; sum: bigint }[]>`
      SELECT a."currency", COALESCE(SUM(e."amount"), 0)::bigint AS "sum"
      FROM "LedgerAccount" a
      LEFT JOIN "LedgerEntry" e ON e."accountId" = a."id"
      WHERE a."campaignId" = ${campaignId} AND a."type" = 'CAMPAIGN_WALLET'
      GROUP BY a."currency"
      ORDER BY a."currency"`;
    return rows.map((r) => ({ currency: r.currency, balance: -r.sum }));
  }

  /** Double-entry invariants, checked from the database itself. */
  async integrity(): Promise<IntegrityReport> {
    const unbalanced = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT "transactionId" AS "id"
      FROM "LedgerEntry"
      GROUP BY "transactionId"
      HAVING SUM("amount") <> 0`;
    const totals = await this.prisma.$queryRaw<{ currency: string; sum: bigint }[]>`
      SELECT a."currency", SUM(e."amount")::bigint AS "sum"
      FROM "LedgerEntry" e
      JOIN "LedgerAccount" a ON a."id" = e."accountId"
      GROUP BY a."currency"`;
    const totalsByCurrency = Object.fromEntries(totals.map((t) => [t.currency, t.sum]));
    return {
      unbalancedTransactionIds: unbalanced.map((r) => r.id),
      totalsByCurrency,
      ok: unbalanced.length === 0 && totals.every((t) => t.sum === 0n),
    };
  }
}
