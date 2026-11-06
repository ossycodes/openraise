import { UpdateSubscriptions } from '../campaign-updates/update-subscriptions.js';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isCurrency } from '@openraise/shared';
import type { Env } from '../config/env.js';
import type { Donation, Prisma } from '../generated/prisma/client.js';
import { donationReceiptEmail } from './receipt-templates.js';

@Injectable()
export class NotificationScheduler {
  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly subscriptions: UpdateSubscriptions,
  ) {}

  /** Called in the same transaction as payment settlement; never performs email I/O. */
  async schedule(
    tx: Prisma.TransactionClient,
    donation: Donation,
    now = new Date(),
  ) {
    if (
      donation.status !== 'SUCCEEDED' ||
      !donation.ledgerTransactionId ||
      !donation.succeededAt ||
      !isCurrency(donation.currency)
    )
      throw new Error('Receipts require a settled donation');
    await this.subscriptions.subscribe(tx, donation);
    const campaign = await tx.campaign.findUniqueOrThrow({
      where: { id: donation.campaignId },
      include: { owner: { select: { email: true } } },
    });
    const snapshot = {
      campaignTitle: campaign.title,
      campaignUrl: new URL(
        `/campaigns/${encodeURIComponent(campaign.slug)}`,
        this.config.get('WEB_URL'),
      ).toString(),
      currency: donation.currency,
    };
    const receipt = donationReceiptEmail({
      ...snapshot,
      ...donation,
      currency: snapshot.currency,
      to: donation.donorEmail,
      confirmedAt: donation.succeededAt,
    });
    await tx.notificationDelivery.upsert({
      where: { dedupeKey: `receipt:${donation.id}` },
      update: {},
      create: {
        dedupeKey: `receipt:${donation.id}`,
        kind: 'DONOR_RECEIPT',
        recipient: donation.donorEmail,
        ...snapshot,
        subject: receipt.subject,
        text: receipt.text,
        html: receipt.html,
        items: { create: { donationId: donation.id, kind: 'DONOR_RECEIPT' } },
      },
    });
    const notice = await tx.donationNotification.findUnique({
      where: {
        donationId_kind: { donationId: donation.id, kind: 'CREATOR_DONATIONS' },
      },
    });
    if (notice) return;
    const bucket = Math.floor(now.getTime() / 60000);
    const dedupeKey = `creator:${campaign.id}:${bucket}`;
    const nextAttemptAt = new Date((bucket + 1) * 60000);
    // The upsert's real update takes the same row lock as the sender. Never append
    // to a digest after its body has been frozen and claimed for sending.
    let delivery = await tx.notificationDelivery.upsert({
      where: { dedupeKey },
      update: { updatedAt: now },
      create: {
        dedupeKey,
        kind: 'CREATOR_DONATIONS',
        recipient: campaign.owner.email,
        ...snapshot,
        nextAttemptAt,
      },
    });
    if (delivery.state !== 'PENDING' || delivery.subject !== null) {
      delivery = await tx.notificationDelivery.upsert({
        where: { dedupeKey: `${dedupeKey}:${donation.id}` },
        update: {},
        create: {
          dedupeKey: `${dedupeKey}:${donation.id}`,
          kind: 'CREATOR_DONATIONS',
          recipient: campaign.owner.email,
          ...snapshot,
          nextAttemptAt,
        },
      });
    }
    await tx.donationNotification.upsert({
      where: {
        donationId_kind: { donationId: donation.id, kind: 'CREATOR_DONATIONS' },
      },
      update: {},
      create: {
        donationId: donation.id,
        kind: 'CREATOR_DONATIONS',
        deliveryId: delivery.id,
      },
    });
  }
}
