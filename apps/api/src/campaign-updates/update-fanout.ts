import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { escapeHtml } from '../mail/templates.js';
import { SettingsService } from '../settings/settings.service.js';
import { UpdateSubscriptions } from './update-subscriptions.js';
@Injectable()
export class UpdateFanout {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly subscriptions: UpdateSubscriptions,
    private readonly settings: SettingsService,
  ) {}
  async nextBatch() {
    return this.prisma.$transaction(async (tx) => {
      const [found] = await tx.$queryRaw<
        { id: string }[]
      >`SELECT "id" FROM "CampaignUpdate" WHERE "fanoutCompletedAt" IS NULL ORDER BY "publishedAt","id" LIMIT 1 FOR UPDATE SKIP LOCKED`;
      if (!found) return false;
      const update = await tx.campaignUpdate.findUniqueOrThrow({
        where: { id: found.id },
        include: { campaign: true },
      });
      if (
        update.hiddenAt ||
        !['ACTIVE', 'PAUSED', 'ENDED'].includes(update.campaign.status)
      ) {
        await tx.campaignUpdate.update({
          where: { id: update.id },
          data: { fanoutCompletedAt: new Date() },
        });
        return true;
      }
      const rows = await tx.campaignUpdateSubscription.findMany({
        where: {
          campaignId: update.campaignId,
          unsubscribedAt: null,
          consentedAt: { lte: update.publishedAt },
          createdAt: { lte: update.publishedAt },
          ...(update.fanoutCursor ? { id: { gt: update.fanoutCursor } } : {}),
        },
        orderBy: { id: 'asc' },
        take: 100,
      });
      const campaignUrl = new URL(
        `/campaigns/${encodeURIComponent(update.campaign.slug)}#updates`,
        this.config.get('WEB_URL'),
      ).toString();
      for (const sub of rows) {
        const unsubscribe = this.subscriptions.unsubscribeUrl(sub.id);
        const excerpt =
          update.body.length > 1500
            ? `${update.body.slice(0, 1500)}…`
            : update.body;
        await tx.notificationDelivery.upsert({
          where: { dedupeKey: `campaign-update:${update.id}:${sub.id}` },
          update: {},
          create: {
            dedupeKey: `campaign-update:${update.id}:${sub.id}`,
            kind: 'CAMPAIGN_UPDATE',
            recipient: sub.email,
            campaignTitle: update.campaign.title,
            campaignUrl,
            currency: update.campaign.currency,
            campaignUpdateId: update.id,
            updateSubscriptionId: sub.id,
            subject: `${(await this.settings.get(tx)).values.name}: ${update.title}`,
            text: `${update.campaign.title}\n\n${update.title}\n\n${excerpt}\n\nRead the update: ${campaignUrl}\n\nYou opted in when donating. Stop update emails: ${unsubscribe}`,
            html: `<h1>${escapeHtml(update.title)}</h1><p>From ${escapeHtml(update.campaign.title)}</p><p style="white-space:pre-wrap">${escapeHtml(excerpt)}</p><p><a href="${escapeHtml(campaignUrl)}">Read the update</a></p><p>You opted in when donating. <a href="${escapeHtml(unsubscribe)}">Stop update emails</a></p>`,
          },
        });
      }
      await tx.campaignUpdate.update({
        where: { id: update.id },
        data: {
          fanoutCursor: rows.at(-1)?.id ?? update.fanoutCursor,
          ...(rows.length < 100 ? { fanoutCompletedAt: new Date() } : {}),
        },
      });
      return true;
    });
  }
}
