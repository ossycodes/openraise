import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Env } from '../config/env.js';
import type { Donation, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
@Injectable()
export class UpdateSubscriptions {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}
  token(id: string) {
    return createHmac('sha256', this.config.get('JWT_SECRET'))
      .update(`campaign-update-unsubscribe:v1:${id}`)
      .digest('hex');
  }
  unsubscribeUrl(id: string) {
    const url = new URL(
      '/campaign-updates/unsubscribe',
      this.config.get('WEB_URL'),
    );
    url.hash = new URLSearchParams({
      subscription: id,
      token: this.token(id),
    }).toString();
    return url.toString();
  }
  async subscribe(tx: Prisma.TransactionClient, donation: Donation) {
    if (!donation.updatesOptIn) return;
    if (donation.status !== 'SUCCEEDED' || !donation.ledgerTransactionId)
      throw new Error('Update subscriptions require confirmed consent');
    const subscription = await tx.campaignUpdateSubscription.upsert({
      where: {
        campaignId_email: {
          campaignId: donation.campaignId,
          email: donation.donorEmail,
        },
      },
      update: { email: donation.donorEmail },
      create: {
        campaignId: donation.campaignId,
        email: donation.donorEmail,
        donationId: donation.id,
        consentedAt: donation.createdAt,
      },
    });
    // A duplicate/older settlement must not undo an unsubscribe or a later choice.
    if (
      subscription.donationId === donation.id ||
      subscription.consentedAt >= donation.createdAt ||
      (subscription.unsubscribedAt &&
        subscription.unsubscribedAt >= donation.createdAt)
    )
      return;
    await tx.campaignUpdateSubscription.update({
      where: { id: subscription.id },
      data: {
        donationId: donation.id,
        consentedAt: donation.createdAt,
        unsubscribedAt: null,
      },
    });
  }
  async unsubscribe(id: string, token: string) {
    const expected = this.token(id);
    if (
      !/^[a-f0-9]{64}$/.test(token) ||
      !timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expected, 'hex'))
    )
      throw new NotFoundException('Subscription not found');
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.campaignUpdateSubscription.findUnique({
        where: { id },
      });
      if (!row) throw new NotFoundException('Subscription not found');
      await tx.campaignUpdateSubscription.update({
        where: { id },
        data: { unsubscribedAt: new Date() },
      });
      await tx.notificationDelivery.updateMany({
        where: {
          updateSubscriptionId: id,
          kind: 'CAMPAIGN_UPDATE',
          state: 'PENDING',
        },
        data: { state: 'FAILED', lastError: 'unsubscribed' },
      });
    });
    return { unsubscribed: true };
  }
}
