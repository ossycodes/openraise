import { Injectable } from '@nestjs/common';
import { isCurrency } from '@openraise/shared';
import { MailDeliveryError, MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { creatorDonationsEmail } from './receipt-templates.js';

@Injectable()
export class NotificationDeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  /** One concurrent worker claims one delivery; network I/O is outside the DB transaction. */
  async processNext(): Promise<boolean> {
    const delivery = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "NotificationDelivery" WHERE "state" = 'PENDING'
        AND "nextAttemptAt" <= CURRENT_TIMESTAMP ORDER BY "nextAttemptAt", "id"
        LIMIT 1 FOR UPDATE SKIP LOCKED`;
      if (!rows[0]) return null;
      const row = await tx.notificationDelivery.findUniqueOrThrow({
        where: { id: rows[0].id },
      });
      const [totals] = await tx.$queryRaw<
        { count: bigint; amount: string; invalid: bigint }[]
      >`
        SELECT COUNT(*) AS "count", COALESCE(SUM(d."amount"), 0)::text AS "amount",
          COUNT(*) FILTER (WHERE d."status" <> 'SUCCEEDED' OR d."ledgerTransactionId" IS NULL
            OR d."currency" <> ${row.currency} OR n."kind" <> ${row.kind}::"NotificationKind") AS "invalid"
        FROM "DonationNotification" n JOIN "Donation" d ON d."id" = n."donationId"
        WHERE n."deliveryId" = ${row.id}`;
      if (
        !totals ||
        totals.count === 0n ||
        totals.invalid > 0n ||
        totals.count > BigInt(Number.MAX_SAFE_INTEGER) ||
        !isCurrency(row.currency)
      ) {
        await tx.notificationDelivery.update({
          where: { id: row.id },
          data: { state: 'FAILED', lastError: 'invalid-settlement' },
        });
        return null;
      }
      const body =
        row.kind === 'CREATOR_DONATIONS' && !row.subject
          ? creatorDonationsEmail({
              to: row.recipient,
              campaignTitle: row.campaignTitle,
              campaignUrl: row.campaignUrl,
              currency: row.currency,
              count: Number(totals.count),
              amount: BigInt(totals.amount),
            })
          : { subject: row.subject, text: row.text, html: row.html };
      if (!body.subject || !body.text || !body.html)
        throw new Error('Missing notification content');
      return tx.notificationDelivery.update({
        where: { id: row.id },
        data: {
          state: 'SENDING',
          attempts: { increment: 1 },
          startedAt: new Date(),
          lastError: null,
          subject: body.subject,
          text: body.text,
          html: body.html,
        },
      });
    });
    if (!delivery) return false;
    try {
      await this.mail.send({
        to: delivery.recipient,
        subject: delivery.subject!,
        text: delivery.text!,
        html: delivery.html!,
        messageId: `<${delivery.id}@receipts.openraise.local>`,
      });
    } catch (error) {
      const known = error instanceof MailDeliveryError;
      const uncertain = !known || error.uncertain;
      const retry =
        known && !uncertain && error.retryable && delivery.attempts < 5;
      await this.prisma.notificationDelivery.updateMany({
        where: {
          id: delivery.id,
          state: 'SENDING',
          attempts: delivery.attempts,
        },
        data: {
          state: uncertain ? 'UNCERTAIN' : retry ? 'PENDING' : 'FAILED',
          nextAttemptAt: new Date(
            Date.now() +
              Math.min(60000 * 2 ** (delivery.attempts - 1), 3600000),
          ),
          lastError: uncertain
            ? 'uncertain-send'
            : retry
              ? 'temporary-rejection'
              : 'delivery-failed',
        },
      });
      return true;
    }
    // If this write fails after SMTP accepted, the SENDING row is never auto-resent.
    await this.prisma.notificationDelivery.updateMany({
      where: {
        id: delivery.id,
        state: { in: ['SENDING', 'UNCERTAIN'] },
        attempts: delivery.attempts,
      },
      data: { state: 'SENT', sentAt: new Date(), lastError: null },
    });
    return true;
  }

  async recoverInterrupted() {
    await this.prisma.notificationDelivery.updateMany({
      where: {
        state: 'SENDING',
        startedAt: { lt: new Date(Date.now() - 300000) },
      },
      data: { state: 'UNCERTAIN', lastError: 'interrupted-send' },
    });
  }
}
