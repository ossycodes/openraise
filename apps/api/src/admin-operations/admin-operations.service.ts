import { requireAdministrator } from '../auth/admin-authorization.js';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { auditActor } from '../audit/actor.js';
import type { AuthUser } from '../auth/auth.types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  AdminList,
  UserAction,
  CampaignAction,
} from './admin-operations.schemas.js';
const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  emailVerifiedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;
@Injectable()
export class AdminOperationsService {
  constructor(private readonly prisma: PrismaService) {}
  categories() {
    return this.prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        sortOrder: true,
        updatedAt: true,
      },
    });
  }
  async users(q: AdminList) {
    const where = q.q
      ? {
          OR: [
            { name: { contains: q.q, mode: 'insensitive' as const } },
            { email: { contains: q.q, mode: 'insensitive' as const } },
          ],
        }
      : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: userSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * 20,
        take: 20,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total, page: q.page, limit: 20 };
  }
  async user(id: string) {
    const row = await this.prisma.user.findUnique({
      where: { id },
      select: {
        ...userSelect,
        _count: { select: { campaigns: true, donations: true } },
      },
    });
    if (!row) throw new NotFoundException('User not found');
    return row;
  }
  async userAction(actor: AuthUser, id: string, input: UserAction) {
    if (actor.id === id)
      throw new ForbiddenException(
        'Another administrator must manage your access',
      );
    await this.prisma.$transaction(async (tx) => {
      // Serialize every administrator-role mutation so concurrent demotions
      // cannot remove the last administrator.
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(734267, 2)`;
      await requireAdministrator(tx, actor.id);
      const row = await tx.user.findUnique({ where: { id } });
      if (!row) throw new NotFoundException('User not found');
      if (row.updatedAt.toISOString() !== input.expectedUpdatedAt)
        throw new ConflictException('User changed. Reload before deciding.');
      if (
        input.action === 'SET_ROLE' &&
        input.role === 'ADMIN' &&
        !row.emailVerifiedAt
      )
        throw new ConflictException(
          'Verify this account’s email before granting administrator access',
        );
      if (input.action === 'SET_ROLE' && input.role === row.role)
        throw new ConflictException('This user already has that role');
      if (
        row.role === 'ADMIN' &&
        input.action === 'SET_ROLE' &&
        input.role === 'USER' &&
        (await tx.user.count({ where: { role: 'ADMIN' } })) <= 1
      )
        throw new ConflictException('At least one administrator must remain');
      await auditActor(tx, actor.id);
      await tx.user.update({
        where: { id },
        data: {
          ...(input.action === 'SET_ROLE' ? { role: input.role } : {}),
          tokenVersion: { increment: 1 },
        },
      });
      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          action:
            input.action === 'SET_ROLE'
              ? 'USER_ACCESS_CHANGED'
              : 'USER_SESSIONS_REVOKED',
          targetType: 'User',
          targetId: id,
          subjectId: id,
          before: { role: row.role },
          after: {
            role: input.action === 'SET_ROLE' ? input.role! : row.role,
            reason: input.reason,
          },
        },
      });
    });
    return this.user(id);
  }
  async campaignAction(actor: AuthUser, id: string, input: CampaignAction) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Campaign" WHERE "id" = ${id} FOR UPDATE`;
      await requireAdministrator(tx, actor.id);
      const c = await tx.campaign.findUnique({ where: { id } });
      if (!c) throw new NotFoundException('Campaign not found');
      if (c.updatedAt.toISOString() !== input.expectedUpdatedAt)
        throw new ConflictException(
          'Campaign changed. Reload before deciding.',
        );
      if (c.ownerId === actor.id)
        throw new ForbiddenException(
          'Another administrator must manage your campaign',
        );
      const action = input.action;
      if (
        action === 'FEATURE' &&
        (c.status !== 'ACTIVE' ||
          c.featured ||
          (c.endsAt && c.endsAt <= new Date()))
      )
        throw new ConflictException(
          'Only a live, unfeatured campaign can be featured',
        );
      if (action === 'UNFEATURE' && !c.featured)
        throw new ConflictException('Campaign is not featured');
      if (action === 'PAUSE' && c.status !== 'ACTIVE')
        throw new ConflictException('Only live campaigns can be paused');
      if (
        action === 'RESUME' &&
        (c.status !== 'PAUSED' || (c.endsAt && c.endsAt <= new Date()))
      )
        throw new ConflictException(
          'Only an unexpired paused campaign can resume',
        );
      if (action === 'END' && !['ACTIVE', 'PAUSED'].includes(c.status))
        throw new ConflictException('Only published campaigns can end');
      if (
        ['FREEZE_PAYOUTS', 'UNFREEZE_PAYOUTS'].includes(action) &&
        c.payoutsFrozen === (action === 'FREEZE_PAYOUTS')
      )
        throw new ConflictException('Payout freeze is already in that state');
      const data =
        action === 'FEATURE' || action === 'UNFEATURE'
          ? { featured: action === 'FEATURE' }
          : action === 'PAUSE'
            ? {
                status: 'PAUSED' as const,
                moderationPaused: true,
                moderationPauseReason: input.reason,
                featured: false,
              }
            : action === 'RESUME'
              ? {
                  status: 'ACTIVE' as const,
                  moderationPaused: false,
                  moderationPauseReason: null,
                }
              : action === 'END'
                ? {
                    status: 'ENDED' as const,
                    endedAt: new Date(),
                    featured: false,
                  }
                : {
                    payoutsFrozen: action === 'FREEZE_PAYOUTS',
                    payoutFreezeReason:
                      action === 'FREEZE_PAYOUTS' ? input.reason : null,
                  };
      await auditActor(tx, actor.id);
      const updated = await tx.campaign.update({ where: { id }, data });
      if (['FREEZE_PAYOUTS', 'UNFREEZE_PAYOUTS'].includes(action))
        await tx.payoutFreezeEvent.create({
          data: {
            campaignId: id,
            actorId: actor.id,
            frozen: action === 'FREEZE_PAYOUTS',
            reason: input.reason,
          },
        });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          action: `ADMIN_CAMPAIGN_${action}`,
          targetType: 'Campaign',
          targetId: id,
          subjectId: c.ownerId,
          before: {
            status: c.status,
            featured: c.featured,
            payoutsFrozen: c.payoutsFrozen,
          },
          after: {
            status: updated.status,
            featured: updated.featured,
            payoutsFrozen: updated.payoutsFrozen,
            reason: input.reason,
          },
        },
      });
      return {
        id,
        status: updated.status,
        featured: updated.featured,
        payoutsFrozen: updated.payoutsFrozen,
        updatedAt: updated.updatedAt,
      };
    });
  }
}
