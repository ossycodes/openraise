import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { withAuditActor } from '../audit/actor.js';
import type { AuthUser } from '../auth/auth.types.js';
import { campaignSlug } from '../campaigns/slug.js';
import { randomToken, sha256 } from '../common/tokens.js';
import type { Env } from '../config/env.js';
import type {
  OrganisationRole,
  Prisma,
} from '../generated/prisma/client.js';
import { MailService } from '../mail/mail.service.js';
import { organisationInviteEmail } from '../mail/templates.js';
import { isUniqueViolation, PrismaService } from '../prisma/prisma.service.js';
import type {
  CreateOrganisationInput,
  InviteInput,
  UpdateOrganisationInput,
} from './organisations.schemas.js';

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Organisations one person can own, so a single account can't spam them. */
export const MAX_OWNED_ORGANISATIONS = 5;
const NOT_FOUND = 'Organisation not found';
const MANAGERS: OrganisationRole[] = ['OWNER', 'ADMIN'];

type Db = Prisma.TransactionClient;

@Injectable()
export class OrganisationsService {
  private readonly logger = new Logger(OrganisationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async create(user: AuthUser, input: CreateOrganisationInput) {
    if (!user.emailVerified)
      throw new ForbiddenException(
        'Verify your email before creating an organisation',
      );
    const owned = await this.prisma.organisationMember.count({
      where: { userId: user.id, role: 'OWNER' },
    });
    if (owned >= MAX_OWNED_ORGANISATIONS)
      throw new ConflictException(
        `You can own at most ${MAX_OWNED_ORGANISATIONS} organisations`,
      );
    for (let attempt = 0; ; attempt++) {
      try {
        const org = await withAuditActor(this.prisma, user.id, async (tx) => {
          const created = await tx.organisation.create({
            data: {
              slug: campaignSlug(input.name),
              name: input.name,
              about: input.about ?? '',
              website: input.website ?? null,
              location: input.location ?? null,
              createdById: user.id,
            },
          });
          await tx.organisationMember.create({
            data: { organisationId: created.id, userId: user.id, role: 'OWNER' },
          });
          return created;
        });
        return this.manage(user, org.id);
      } catch (error) {
        if (!isUniqueViolation(error) || attempt >= 4) throw error;
      }
    }
  }

  /** The organisations the signed-in person belongs to. */
  async mine(user: AuthUser) {
    const rows = await this.prisma.organisationMember.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
      include: { organisation: { select: { id: true, slug: true, name: true } } },
    });
    return rows.map((m) => ({ ...m.organisation, role: m.role }));
  }

  /** Anyone can see an organisation's public profile. */
  async profile(slug: string) {
    const org = await this.prisma.organisation.findUnique({
      where: { slug },
      select: {
        slug: true,
        name: true,
        about: true,
        website: true,
        location: true,
        createdAt: true,
      },
    });
    if (!org) throw new NotFoundException(NOT_FOUND);
    return org;
  }

  /** Everything a member sees; invitations only for owners and admins. */
  async manage(user: AuthUser, id: string) {
    const me = await this.membership(user.id, id);
    const [org, members, invites] = await Promise.all([
      this.prisma.organisation.findUniqueOrThrow({ where: { id } }),
      this.prisma.organisationMember.findMany({
        where: { organisationId: id },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        include: { user: { select: { name: true, email: true } } },
      }),
      MANAGERS.includes(me.role)
        ? this.prisma.organisationInvite.findMany({
            where: {
              organisationId: id,
              acceptedAt: null,
              revokedAt: null,
              expiresAt: { gt: new Date() },
            },
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              email: true,
              role: true,
              expiresAt: true,
              createdAt: true,
            },
          })
        : Promise.resolve(null),
    ]);
    return {
      organisation: {
        id: org.id,
        slug: org.slug,
        name: org.name,
        about: org.about,
        website: org.website,
        location: org.location,
        createdAt: org.createdAt,
      },
      myRole: me.role,
      members: members.map((m) => ({
        id: m.id,
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
        joinedAt: m.createdAt,
        you: m.userId === user.id,
      })),
      invites,
    };
  }

  async update(user: AuthUser, id: string, input: UpdateOrganisationInput) {
    await this.requireManager(user.id, id);
    await withAuditActor(this.prisma, user.id, (tx) =>
      tx.organisation.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.about !== undefined ? { about: input.about } : {}),
          ...(input.website !== undefined ? { website: input.website } : {}),
          ...(input.location !== undefined ? { location: input.location } : {}),
        },
      }),
    );
    return this.manage(user, id);
  }

  /**
   * Email an invitation. A new invite to the same address replaces the open
   * one, so a resend never leaves two working links.
   */
  async invite(user: AuthUser, id: string, input: InviteInput) {
    const me = await this.requireManager(user.id, id);
    if (input.role === 'OWNER' && me.role !== 'OWNER')
      throw new ForbiddenException('Only an owner can invite another owner');
    const existing = await this.prisma.organisationMember.findFirst({
      where: { organisationId: id, user: { email: input.email } },
      select: { id: true },
    });
    if (existing)
      throw new ConflictException('That person is already in this organisation');

    const token = randomToken();
    const now = new Date();
    const invite = await this.prisma.$transaction(async (tx) => {
      await tx.organisationInvite.updateMany({
        where: {
          organisationId: id,
          email: input.email,
          acceptedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: now },
      });
      return tx.organisationInvite.create({
        data: {
          organisationId: id,
          email: input.email,
          role: input.role,
          tokenHash: sha256(token),
          invitedById: user.id,
          expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
        },
        include: {
          organisation: { select: { name: true } },
          invitedBy: { select: { name: true } },
        },
      });
    });

    const link = new URL(
      '/organisations/invite',
      this.config.get('WEB_URL', { infer: true }),
    );
    link.searchParams.set('token', token);
    let emailSent = true;
    try {
      await this.mail.send(
        organisationInviteEmail(
          invite.invitedBy.name,
          invite.organisation.name,
          invite.role,
          invite.email,
          link.toString(),
        ),
      );
    } catch (error) {
      // The invite stands; the manager can send it again.
      emailSent = false;
      this.logger.warn(`Organisation invite email not sent: ${String(error)}`);
    }
    return {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt,
      emailSent,
    };
  }

  async revokeInvite(user: AuthUser, id: string, inviteId: string) {
    await this.requireManager(user.id, id);
    const { count } = await this.prisma.organisationInvite.updateMany({
      where: {
        id: inviteId,
        organisationId: id,
        acceptedAt: null,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
    if (count === 0) throw new NotFoundException('Invitation not found');
  }

  /** What an invitation link is for, before signing in to accept it. */
  async previewInvite(token: string) {
    const invite = await this.prisma.organisationInvite.findUnique({
      where: { tokenHash: sha256(token) },
      include: { organisation: { select: { name: true, slug: true } } },
    });
    if (!invite) throw new NotFoundException('Invitation not found');
    return {
      organisation: invite.organisation,
      role: invite.role,
      email: invite.email,
      status: this.inviteStatus(invite),
    };
  }

  /**
   * Join with an invitation. Only the invited address can accept, and only
   * once; joining never lowers the role of someone already in the team.
   */
  async acceptInvite(user: AuthUser, token: string) {
    if (!user.emailVerified)
      throw new ForbiddenException('Verify your email before joining');
    const invite = await this.prisma.organisationInvite.findUnique({
      where: { tokenHash: sha256(token) },
      include: { organisation: { select: { id: true, slug: true } } },
    });
    if (!invite) throw new NotFoundException('Invitation not found');
    if (this.inviteStatus(invite) !== 'OPEN')
      throw new BadRequestException(
        'This invitation has expired or was already used. Ask for a new one.',
      );
    if (invite.email !== user.email.toLowerCase())
      throw new ForbiddenException(
        `This invitation was sent to ${invite.email}. Sign in with that address to accept it.`,
      );
    await withAuditActor(this.prisma, user.id, async (tx) => {
      const claimed = await tx.organisationInvite.updateMany({
        where: { id: invite.id, acceptedAt: null, revokedAt: null },
        data: { acceptedAt: new Date() },
      });
      if (claimed.count === 0)
        throw new ConflictException('This invitation was already used');
      await tx.organisationMember.upsert({
        where: {
          organisationId_userId: {
            organisationId: invite.organisationId,
            userId: user.id,
          },
        },
        create: {
          organisationId: invite.organisationId,
          userId: user.id,
          role: invite.role,
        },
        update: {},
      });
    });
    return invite.organisation;
  }

  async changeRole(
    user: AuthUser,
    id: string,
    memberId: string,
    role: OrganisationRole,
  ) {
    await withAuditActor(this.prisma, user.id, async (tx) => {
      await this.lock(tx, id);
      const me = await this.requireManager(user.id, id, tx);
      const target = await this.member(tx, id, memberId);
      if (me.role !== 'OWNER' && (target.role === 'OWNER' || role === 'OWNER'))
        throw new ForbiddenException('Only an owner can change owners');
      if (target.role === 'OWNER' && role !== 'OWNER')
        await this.keepAnOwner(tx, id, target.id);
      await tx.organisationMember.update({
        where: { id: target.id },
        data: { role },
      });
    });
    return this.manage(user, id);
  }

  /** Remove someone, or leave (memberId is your own membership). */
  async remove(user: AuthUser, id: string, memberId: string) {
    await withAuditActor(this.prisma, user.id, async (tx) => {
      await this.lock(tx, id);
      const me = await this.membership(user.id, id, tx);
      const target = await this.member(tx, id, memberId);
      const leaving = target.userId === user.id;
      if (!leaving) {
        if (!MANAGERS.includes(me.role))
          throw new ForbiddenException('Only owners and admins can remove people');
        if (target.role === 'OWNER' && me.role !== 'OWNER')
          throw new ForbiddenException('Only an owner can remove an owner');
      }
      if (target.role === 'OWNER') await this.keepAnOwner(tx, id, target.id);
      await tx.organisationMember.delete({ where: { id: target.id } });
    });
  }

  private inviteStatus(invite: {
    acceptedAt: Date | null;
    revokedAt: Date | null;
    expiresAt: Date;
  }): 'OPEN' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED' {
    if (invite.acceptedAt) return 'ACCEPTED';
    if (invite.revokedAt) return 'REVOKED';
    if (invite.expiresAt <= new Date()) return 'EXPIRED';
    return 'OPEN';
  }

  /** Serialises team changes per organisation, so two can't both remove the last owner. */
  private async lock(tx: Db, id: string) {
    await tx.$queryRaw`SELECT "id" FROM "Organisation" WHERE "id" = ${id} FOR UPDATE`;
  }

  private async keepAnOwner(tx: Db, id: string, exceptMemberId: string) {
    const others = await tx.organisationMember.count({
      where: { organisationId: id, role: 'OWNER', id: { not: exceptMemberId } },
    });
    if (others === 0)
      throw new ConflictException(
        'An organisation needs at least one owner. Make someone else an owner first.',
      );
  }

  /** Your membership; not being a member looks exactly like "not found". */
  private async membership(userId: string, id: string, db: Db = this.prisma) {
    const me = await db.organisationMember.findUnique({
      where: { organisationId_userId: { organisationId: id, userId } },
    });
    if (!me) throw new NotFoundException(NOT_FOUND);
    return me;
  }

  private async requireManager(userId: string, id: string, db: Db = this.prisma) {
    const me = await this.membership(userId, id, db);
    if (!MANAGERS.includes(me.role))
      throw new ForbiddenException('Only owners and admins can do that');
    return me;
  }

  private async member(tx: Db, id: string, memberId: string) {
    const target = await tx.organisationMember.findFirst({
      where: { id: memberId, organisationId: id },
    });
    if (!target) throw new NotFoundException('Member not found');
    return target;
  }
}
