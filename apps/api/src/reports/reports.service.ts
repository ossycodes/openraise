import { auditActor } from '../audit/actor.js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { AuthUser } from '../auth/auth.types.js';
import { PrismaService, isUniqueViolation } from '../prisma/prisma.service.js';
import { idempotencyKeySchema } from '../donations/donations.schemas.js';
import { CampaignsService } from '../campaigns/campaigns.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import type {
  ReportInput,
  ReportsQuery,
  ModerationInput,
} from './reports.schemas.js';
const publicStatuses = ['ACTIVE', 'PAUSED', 'ENDED'] as const;
const reportSelect = {
  id: true,
  category: true,
  details: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  campaignId: true,
} satisfies Prisma.CampaignReportSelect;
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly campaigns: CampaignsService,
  ) {}
  async submit(slug: string, body: ReportInput, key: string | undefined) {
    const parsed = idempotencyKeySchema.safeParse(key);
    if (!parsed.success)
      throw new BadRequestException('Use a UUID v4 Idempotency-Key');
    const campaign = await this.prisma.campaign.findFirst({
      where: { slug, status: { in: [...publicStatuses] } },
      select: { id: true },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    const hash = createHash('sha256')
      .update(`campaign-report:${parsed.data}`)
      .digest('hex');
    const replay = (prior: {
      campaignId: string;
      category: string;
      details: string;
    }) => {
      if (
        prior.campaignId !== campaign.id ||
        prior.category !== body.category ||
        prior.details !== body.details
      )
        throw new ConflictException(
          'This request key was used for a different report',
        );
      return { received: true };
    };
    const prior = await this.prisma.campaignReport.findUnique({
      where: { idempotencyKeyHash: hash },
    });
    if (prior) return replay(prior);
    try {
      await this.prisma.campaignReport.create({
        data: { campaignId: campaign.id, ...body, idempotencyKeyHash: hash },
      });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      const existing = await this.prisma.campaignReport.findUniqueOrThrow({
        where: { idempotencyKeyHash: hash },
      });
      return replay(existing);
    }
    return { received: true };
  }
  async queue(query: ReportsQuery) {
    const where: Prisma.CampaignReportWhereInput = {
      status: query.status,
      ...(query.q
        ? { campaign: { title: { contains: query.q, mode: 'insensitive' } } }
        : {}),
    };
    const [rows, total, open] = await this.prisma.$transaction([
      this.prisma.campaignReport.findMany({
        where,
        select: {
          ...reportSelect,
          campaign: {
            select: {
              title: true,
              slug: true,
              status: true,
              owner: { select: { name: true } },
            },
          },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * 20,
        take: 20,
      }),
      this.prisma.campaignReport.count({ where }),
      this.prisma.campaignReport.count({ where: { status: 'OPEN' } }),
    ]);
    return {
      items: rows.map((r) => ({ ...r, details: r.details.slice(0, 160) })),
      total,
      open,
      page: query.page,
      limit: 20,
    };
  }
  async detail(id: string) {
    const report = await this.prisma.campaignReport.findUnique({
      where: { id },
      select: reportSelect,
    });
    if (!report) throw new NotFoundException('Report not found');
    const [preview, controls, actions] = await Promise.all([
      this.campaigns.reviewDetail(report.campaignId),
      this.prisma.campaign.findUniqueOrThrow({
        where: { id: report.campaignId },
        select: {
          updatedAt: true,
          payoutsFrozen: true,
          payoutFreezeReason: true,
          moderationPaused: true,
          moderationPauseReason: true,
        },
      }),
      this.prisma.reportModerationAction.findMany({
        where: { reportId: id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 50,
        select: {
          id: true,
          action: true,
          reason: true,
          createdAt: true,
          actor: { select: { name: true } },
        },
      }),
    ]);
    return { report, campaign: preview.campaign, controls, actions };
  }
  async moderate(user: AuthUser, id: string, body: ModerationInput) {
    return this.prisma.$transaction(async (tx) => {
      await auditActor(tx, user.id);
      const reference = await tx.campaignReport.findUnique({
        where: { id },
        select: { campaignId: true },
      });
      if (!reference) throw new NotFoundException('Report not found');
      // Match withdrawal reservation locking; a freeze and new reservation cannot pass concurrently.
      await tx.$queryRaw`SELECT "id" FROM "Campaign" WHERE "id"=${reference.campaignId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "CampaignReport" WHERE "id"=${id} FOR UPDATE`;
      const campaign = await tx.campaign.findUniqueOrThrow({
        where: { id: reference.campaignId },
      });
      const report = await tx.campaignReport.findUniqueOrThrow({
        where: { id },
      });
      if (campaign.ownerId === user.id)
        throw new ForbiddenException(
          'Another administrator must moderate reports about your campaign',
        );
      if (
        campaign.updatedAt.getTime() !==
          new Date(body.expectedCampaignUpdatedAt).getTime() ||
        report.updatedAt.getTime() !==
          new Date(body.expectedReportUpdatedAt).getTime()
      )
        throw new ConflictException(
          'This report or campaign has changed. Reload before taking action.',
        );
      const { action, reason } = body;
      if (action === 'PAUSE') {
        if (
          !['ACTIVE', 'PAUSED'].includes(campaign.status) ||
          campaign.moderationPaused
        )
          throw new ConflictException('This campaign cannot be paused again');
        await tx.campaign.update({
          where: { id: campaign.id },
          data: {
            status: 'PAUSED',
            moderationPaused: true,
            moderationPauseReason: reason,
          },
        });
      } else if (action === 'LIFT_PAUSE') {
        if (!campaign.moderationPaused)
          throw new ConflictException('There is no moderation pause to lift');
        await tx.campaign.update({
          where: { id: campaign.id },
          data: { moderationPaused: false, moderationPauseReason: null },
        });
      } else if (action === 'FREEZE' || action === 'UNFREEZE') {
        const frozen = action === 'FREEZE';
        if (campaign.payoutsFrozen === frozen)
          throw new ConflictException(
            'The payout restriction has already changed',
          );
        await tx.payoutFreezeEvent.create({
          data: { campaignId: campaign.id, actorId: user.id, frozen, reason },
        });
        await tx.campaign.update({
          where: { id: campaign.id },
          data: {
            payoutsFrozen: frozen,
            payoutFreezeReason: frozen ? reason : null,
          },
        });
      } else if (report.status !== 'OPEN')
        throw new ConflictException('This report is already closed');
      await tx.campaignReport.update({
        where: { id },
        data: {
          updatedAt: new Date(),
          ...(action === 'RESOLVE'
            ? { status: 'RESOLVED', closedAt: new Date() }
            : action === 'DISMISS'
              ? { status: 'DISMISSED', closedAt: new Date() }
              : {}),
        },
      });
      await tx.reportModerationAction.create({
        data: {
          reportId: id,
          campaignId: campaign.id,
          actorId: user.id,
          action,
          reason,
        },
      });
      return { recorded: true };
    });
  }
}
