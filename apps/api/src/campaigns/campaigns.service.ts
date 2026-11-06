import { auditActor, withAuditActor } from '../audit/actor.js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { FeesService } from '../fees/fees.service.js';
import { KycService } from '../kyc/kyc.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { isUniqueViolation, PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import {
  CURRENCY_EDITABLE_STATUSES,
  EDITABLE_STATUSES,
  PUBLIC_STATUSES,
  TRANSITIONS,
  type CampaignAction,
} from './campaign-status.js';
import {
  SUBMIT_REQUIREMENTS,
  type CreateCampaignInput,
  type CampaignSort,
  type ListCampaignsQuery,
  type UpdateCampaignInput,
} from './campaigns.schemas.js';
import type { ReviewQueueQuery } from './review.schemas.js';
import { campaignSlug } from './slug.js';

const include = {
  category: { select: { slug: true, name: true } },
  owner: { select: { id: true, name: true } },
  images: {
    orderBy: { position: 'asc' },
    select: {
      id: true,
      key: true,
      position: true,
      contentType: true,
      size: true,
    },
  },
} satisfies Prisma.CampaignInclude;

type CampaignRow = Prisma.CampaignGetPayload<{ include: typeof include }>;

export interface PublicCampaign {
  id: string;
  slug: string;
  title: string;
  summary: string;
  story: string;
  videoUrl: string | null;
  category: { slug: string; name: string };
  owner: { name: string };
  /** Minor units as strings */
  goalAmount: string;
  currency: string;
  /** Gross donations backed by committed ledger postings */
  raisedAmount: string;
  donorCount: number;
  beneficiaryName: string | null;
  location: string | null;
  endsAt: Date | null;
  /** In display order; the first is the cover */
  images: {
    id: string;
    url: string;
    position: number;
    contentType: string;
    size: number;
  }[];
  coverImageUrl: string | null;
  status: CampaignRow['status'];
  /** Only shown to the owner and admins */
  rejectionReason?: string | null;
  moderationPaused?: boolean;
  moderationPauseReason?: string | null;
  featured: boolean;
  submittedAt: Date | null;
  publishedAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CampaignPage {
  items: PublicCampaign[];
  page: number;
  limit: number;
  total: number;
}

function toPublic(
  c: CampaignRow,
  privileged: boolean,
  storage: Pick<StorageService, 'publicUrl'>,
  totals?: { raisedAmount: string; donorCount: number },
): PublicCampaign {
  const images = c.images.map((i) => ({
    id: i.id,
    url: storage.publicUrl(i.key),
    position: i.position,
    contentType: i.contentType,
    size: i.size,
  }));
  return {
    id: c.id,
    slug: c.slug,
    title: c.title,
    summary: c.summary,
    story: c.story,
    videoUrl: c.videoUrl,
    category: c.category,
    owner: { name: c.owner.name },
    goalAmount: c.goalAmount.toString(),
    currency: c.currency,
    raisedAmount: totals?.raisedAmount ?? '0',
    donorCount: totals?.donorCount ?? 0,
    beneficiaryName: c.beneficiaryName,
    location: c.location,
    endsAt: c.endsAt,
    images,
    coverImageUrl: images[0]?.url ?? null,
    status: c.status,
    ...(privileged
      ? {
          rejectionReason: c.rejectionReason,
          moderationPaused: c.moderationPaused,
          moderationPauseReason: c.moderationPauseReason,
        }
      : {}),
    featured: c.featured,
    submittedAt: c.submittedAt,
    publishedAt: c.publishedAt,
    endedAt: c.endedAt,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

const NOT_FOUND = 'Campaign not found';

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fees: FeesService,
    private readonly storage: StorageService,
    private readonly kyc: KycService,
  ) {}

  async create(
    user: AuthUser,
    input: CreateCampaignInput,
  ): Promise<PublicCampaign> {
    const categoryId = await this.categoryId(input.categorySlug);
    const data = {
      ownerId: user.id,
      categoryId,
      title: input.title,
      summary: input.summary ?? '',
      story: input.story ?? '',
      videoUrl: input.videoUrl ?? null,
      goalAmount: input.goalAmount,
      currency: input.currency ?? this.fees.currency,
      beneficiaryName: input.beneficiaryName ?? null,
      location: input.location ?? null,
      endsAt: input.endsAt ?? null,
    };
    // The 5-character suffix makes collisions rare; retry the odd one.
    for (let attempt = 0; ; attempt++) {
      try {
        const row = await this.prisma.campaign.create({
          data: { ...data, slug: campaignSlug(input.title) },
          include,
        });
        return this.presentOne(row, true);
      } catch (error) {
        if (!isUniqueViolation(error) || attempt >= 4) throw error;
      }
    }
  }

  async listPublic(query: ListCampaignsQuery): Promise<CampaignPage> {
    const sort = query.q
      ? (query.sort ?? 'relevance')
      : query.sort === 'relevance'
        ? 'newest'
        : (query.sort ?? 'newest');
    if (query.q || sort !== 'newest') return this.searchPublic(query, sort);

    const where: Prisma.CampaignWhereInput = {
      status: 'ACTIVE',
      ...(query.category ? { category: { slug: query.category } } : {}),
      ...(query.featured ? { featured: query.featured === 'true' } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.campaign.findMany({
        where,
        include,
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.campaign.count({ where }),
    ]);
    return {
      items: await this.present(rows, false),
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  /**
   * Search and the computed sorts. Raised totals follow the same rule as
   * `present()`: only succeeded donations backed by a committed ledger
   * posting count. Trending is a recency-weighted count of the last 14 days'
   * donations (3-day decay), so mixed currencies can't skew it.
   */
  private async searchPublic(
    query: ListCampaignsQuery,
    sort: CampaignSort,
  ): Promise<CampaignPage> {
    const tsQuery = query.q
      ? Prisma.sql`(websearch_to_tsquery('english', ${query.q}) || websearch_to_tsquery('simple', ${query.q}))`
      : null;
    const conditions = [Prisma.sql`c."status" = 'ACTIVE'`];
    if (query.category)
      conditions.push(Prisma.sql`cat."slug" = ${query.category}`);
    if (query.featured)
      conditions.push(Prisma.sql`c."featured" = ${query.featured === 'true'}`);
    if (tsQuery) conditions.push(Prisma.sql`c."searchVector" @@ ${tsQuery}`);
    const where = Prisma.join(conditions, ' AND ');

    const order = {
      relevance: tsQuery
        ? Prisma.sql`ts_rank(c."searchVector", ${tsQuery}) DESC,`
        : Prisma.empty,
      trending: Prisma.sql`COALESCE(t."score", 0) DESC,`,
      'close-to-goal': Prisma.sql`(COALESCE(r."raised", 0) >= c."goalAmount") ASC,
        COALESCE(r."raised", 0)::numeric / c."goalAmount" DESC,`,
      newest: Prisma.empty,
    }[sort];

    const [ids, counted] = await Promise.all([
      this.prisma.$queryRaw<{ id: string }[]>`
        WITH confirmed AS (
          SELECT d."campaignId", d."amount", d."succeededAt"
          FROM "Donation" d JOIN "LedgerTransaction" l ON l."id" = d."ledgerTransactionId"
          WHERE d."status" = 'SUCCEEDED' AND l."kind" = 'DONATION' AND l."currency" = d."currency"
        ),
        raised AS (
          SELECT "campaignId", SUM("amount") AS "raised" FROM confirmed GROUP BY "campaignId"
        ),
        trend AS (
          SELECT "campaignId",
            SUM(EXP(-EXTRACT(EPOCH FROM (now() - "succeededAt")) / 259200.0)) AS "score"
          FROM confirmed
          WHERE "succeededAt" > now() - interval '14 days'
          GROUP BY "campaignId"
        )
        SELECT c."id"
        FROM "Campaign" c
        JOIN "Category" cat ON cat."id" = c."categoryId"
        LEFT JOIN raised r ON r."campaignId" = c."id"
        LEFT JOIN trend t ON t."campaignId" = c."id"
        WHERE ${where}
        ORDER BY ${order} c."publishedAt" DESC NULLS LAST, c."id" DESC
        LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}`,
      this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) AS "count"
        FROM "Campaign" c JOIN "Category" cat ON cat."id" = c."categoryId"
        WHERE ${where}`,
    ]);

    const rows = await this.prisma.campaign.findMany({
      where: { id: { in: ids.map((r) => r.id) } },
      include,
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const ordered = ids.flatMap((r) => byId.get(r.id) ?? []);
    return {
      items: await this.present(ordered, false),
      page: query.page,
      limit: query.limit,
      total: Number(counted[0]?.count ?? 0),
    };
  }

  async listMine(user: AuthUser): Promise<PublicCampaign[]> {
    const rows = await this.prisma.campaign.findMany({
      where: { ownerId: user.id },
      include,
      orderBy: { createdAt: 'desc' },
    });
    return this.present(rows, true);
  }

  /**
   * Public campaigns are visible to everyone; drafts, campaigns in review
   * and rejected ones only to their owner and admins. Everyone else gets a
   * 404, so unpublished campaigns can't be discovered by guessing slugs.
   */
  async getBySlug(slug: string, viewer?: AuthUser): Promise<PublicCampaign> {
    const row = await this.prisma.campaign.findUnique({
      where: { slug },
      include,
    });
    if (!row) throw new NotFoundException(NOT_FOUND);
    const privileged =
      !!viewer && (viewer.id === row.ownerId || viewer.role === 'ADMIN');
    if (!PUBLIC_STATUSES.includes(row.status) && !privileged) {
      throw new NotFoundException(NOT_FOUND);
    }
    return this.presentOne(row, privileged);
  }

  async update(
    user: AuthUser,
    id: string,
    input: UpdateCampaignInput,
  ): Promise<PublicCampaign> {
    const row = await this.owned(user, id);
    if (!EDITABLE_STATUSES.includes(row.status)) {
      throw new ConflictException(
        row.status === 'PENDING_REVIEW'
          ? 'This campaign is being reviewed; wait for the decision before editing'
          : 'This campaign has ended and can no longer be edited',
      );
    }
    if (
      input.currency &&
      input.currency !== row.currency &&
      !CURRENCY_EDITABLE_STATUSES.includes(row.status)
    ) {
      throw new ConflictException(
        'The currency is fixed once a campaign is submitted',
      );
    }

    const { categorySlug, ...fields } = input;
    const data: Prisma.CampaignUncheckedUpdateInput = { ...fields };
    if (categorySlug) data.categoryId = await this.categoryId(categorySlug);

    const updated = await this.prisma.campaign.update({
      where: { id: row.id },
      data,
      include,
    });
    return this.presentOne(updated, true);
  }

  /** Owner actions: submit, pause, resume, end. */
  async ownerAction(
    user: AuthUser,
    id: string,
    action: Exclude<CampaignAction, 'approve' | 'reject'>,
  ): Promise<PublicCampaign> {
    const row = await this.owned(user, id);
    if (action === 'submit') {
      this.assertReadyToSubmit(user, row);
      await this.kyc.requireVerified(
        user.id,
        'Verify your identity before submitting a campaign',
      );
    }
    if (action === 'resume' && row.moderationPaused)
      throw new ConflictException(
        'An administrator has paused this campaign. Wait for the moderation restriction to be lifted.',
      );

    const now = new Date();
    const extra: Prisma.CampaignUpdateManyMutationInput =
      action === 'submit'
        ? { submittedAt: now, rejectionReason: null }
        : action === 'end'
          ? { endedAt: now }
          : {};
    return this.transition(row.id, action, extra, user.id);
  }

  async reviewQueue(query: ReviewQueueQuery) {
    const where: Prisma.CampaignWhereInput = {
      status: query.status,
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' } },
              { owner: { name: { contains: query.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [rows, total, pending] = await this.prisma.$transaction([
      this.prisma.campaign.findMany({
        where,
        include,
        orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * 20,
        take: 20,
      }),
      this.prisma.campaign.count({ where }),
      this.prisma.campaign.count({ where: { status: 'PENDING_REVIEW' } }),
    ]);
    return {
      items: rows.map((c) => ({
        id: c.id,
        slug: c.slug,
        title: c.title,
        summary: c.summary,
        status: c.status,
        owner: { name: c.owner.name },
        category: c.category,
        location: c.location,
        goalAmount: c.goalAmount.toString(),
        currency: c.currency,
        coverImageUrl: c.images[0]
          ? this.storage.publicUrl(c.images[0].key)
          : null,
        submittedAt: c.submittedAt,
        updatedAt: c.updatedAt,
      })),
      total,
      pending,
      page: query.page,
      limit: 20,
    };
  }

  async reviewDetail(id: string) {
    const row = await this.prisma.campaign.findUnique({
      where: { id },
      include,
    });
    if (!row) throw new NotFoundException(NOT_FOUND);
    const [organiser, reviews, verifiedName] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: row.ownerId },
        select: { name: true, emailVerifiedAt: true, createdAt: true },
      }),
      this.prisma.campaignReview.findMany({
        where: { campaignId: id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 20,
        select: {
          id: true,
          decision: true,
          reason: true,
          submittedAt: true,
          createdAt: true,
          reviewer: { select: { name: true } },
        },
      }),
      this.kyc.verifiedName(row.ownerId),
    ]);
    return {
      campaign: await this.presentOne(row, true),
      organiser: {
        name: organiser.name,
        emailVerified: !!organiser.emailVerifiedAt,
        identityVerified: verifiedName !== null,
        verifiedName,
        createdAt: organiser.createdAt,
      },
      reviews,
    };
  }

  /** Legacy routes share the same atomic decision/audit path. */
  approve(id: string, user: AuthUser) {
    return this.decideReview(user, id, 'APPROVE');
  }
  reject(id: string, reason: string, user: AuthUser) {
    return this.decideReview(user, id, 'REJECT', reason);
  }

  async decideReview(
    user: AuthUser,
    id: string,
    decision: 'APPROVE' | 'REJECT',
    reason?: string,
    expectedUpdatedAt?: string,
  ) {
    const row = await this.prisma.$transaction(async (tx) => {
      await auditActor(tx, user.id);
      const current = await tx.campaign.findUnique({ where: { id } });
      if (!current) throw new NotFoundException(NOT_FOUND);
      if (current.ownerId === user.id)
        throw new ForbiddenException(
          'Another administrator must review your campaign',
        );
      if (
        current.status !== 'PENDING_REVIEW' ||
        (expectedUpdatedAt &&
          current.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime())
      )
        throw new ConflictException(
          'This submission has changed or was already reviewed. Reload it before deciding.',
        );
      if (
        decision === 'APPROVE' &&
        current.endsAt &&
        current.endsAt <= new Date()
      )
        throw new ConflictException(
          'The campaign end date has passed. Return it to the creator for changes.',
        );
      // Checked again here: verification is the condition for going live,
      // not only for submitting.
      if (
        decision === 'APPROVE' &&
        !(await this.kyc.verifiedName(current.ownerId, tx))
      )
        throw new ConflictException({
          message:
            "The organiser's identity isn't verified. Approve once it is, or return the campaign.",
          code: 'IDENTITY_UNVERIFIED',
        });
      const updated = await tx.campaign.updateMany({
        where: { id, status: 'PENDING_REVIEW', updatedAt: current.updatedAt },
        data:
          decision === 'APPROVE'
            ? {
                status: 'ACTIVE',
                publishedAt: new Date(),
                rejectionReason: null,
              }
            : { status: 'REJECTED', rejectionReason: reason },
      });
      if (!updated.count)
        throw new ConflictException(
          'Another reviewer changed this submission. Reload before deciding.',
        );
      await tx.campaignReview.create({
        data: {
          campaignId: id,
          reviewerId: user.id,
          decision,
          reason: decision === 'REJECT' ? reason : null,
          submittedAt: current.submittedAt,
          reviewedVersion: current.updatedAt,
        },
      });
      return tx.campaign.findUniqueOrThrow({ where: { id }, include });
    });
    return this.presentOne(row, true);
  }

  /** Only drafts can be deleted; anything that has been submitted is kept. */
  async remove(user: AuthUser, id: string): Promise<void> {
    const row = await this.owned(user, id);
    const deleted = await this.prisma.campaign.deleteMany({
      where: { id: row.id, status: 'DRAFT' },
    });
    if (deleted.count === 0) {
      throw new ConflictException('Only drafts can be deleted');
    }
    // Image rows cascade; their files would otherwise be orphaned in storage.
    await Promise.all(row.images.map((i) => this.storage.deleteQuietly(i.key)));
  }

  /**
   * Apply a status change with a conditional update, so two concurrent
   * requests can't both move the campaign (e.g. approve and reject).
   */
  private async transition(
    id: string,
    action: CampaignAction,
    extra: Prisma.CampaignUpdateManyMutationInput,
    actorId: string,
  ): Promise<PublicCampaign> {
    const { from, to } = TRANSITIONS[action];
    const result = await withAuditActor(this.prisma, actorId, async (tx) =>
      tx.campaign.updateMany({
        where: {
          id,
          status: { in: [...from] },
          ...(action === 'resume' ? { moderationPaused: false } : {}),
        },
        data: { ...extra, status: to },
      }),
    );
    if (result.count === 0) {
      const exists = await this.prisma.campaign.findUnique({
        where: { id },
        select: { status: true },
      });
      if (!exists) throw new NotFoundException(NOT_FOUND);
      throw new ConflictException(
        `Can't ${action} a campaign that is ${exists.status.toLowerCase().replace('_', ' ')}`,
      );
    }
    const row = await this.prisma.campaign.findUniqueOrThrow({
      where: { id },
      include,
    });
    return this.presentOne(row, true);
  }

  private async presentOne(
    row: CampaignRow,
    privileged: boolean,
  ): Promise<PublicCampaign> {
    return (await this.present([row], privileged))[0]!;
  }

  private async present(
    rows: CampaignRow[],
    privileged: boolean,
  ): Promise<PublicCampaign[]> {
    if (!rows.length) return [];
    // A succeeded flag alone never contributes: require its committed ledger posting.
    const totals = await this.prisma.$queryRaw<
      { campaignId: string; raisedAmount: string; donorCount: bigint }[]
    >`
      SELECT d."campaignId", SUM(d."amount")::text AS "raisedAmount",
        COUNT(DISTINCT d."donorEmail") AS "donorCount"
      FROM "Donation" d JOIN "LedgerTransaction" l ON l."id" = d."ledgerTransactionId"
      WHERE d."campaignId" IN (${Prisma.join(rows.map((row) => row.id))})
        AND d."status" = 'SUCCEEDED' AND l."kind" = 'DONATION' AND l."currency" = d."currency"
      GROUP BY d."campaignId"`;
    const byCampaign = new Map(
      totals.map((total) => [
        total.campaignId,
        {
          raisedAmount: total.raisedAmount,
          donorCount: Number(total.donorCount),
        },
      ]),
    );
    return rows.map((row) =>
      toPublic(row, privileged, this.storage, byCampaign.get(row.id)),
    );
  }

  private assertReadyToSubmit(user: AuthUser, row: CampaignRow): void {
    if (!user.emailVerified) {
      throw new ForbiddenException(
        'Verify your email before submitting a campaign',
      );
    }
    const errors: { path: string; message: string }[] = [];
    if (row.summary.length < SUBMIT_REQUIREMENTS.summaryMin) {
      errors.push({
        path: 'summary',
        message: `Write a summary of at least ${SUBMIT_REQUIREMENTS.summaryMin} characters`,
      });
    }
    if (row.story.length < SUBMIT_REQUIREMENTS.storyMin) {
      errors.push({
        path: 'story',
        message: `Tell the story in at least ${SUBMIT_REQUIREMENTS.storyMin} characters`,
      });
    }
    if (row.endsAt && row.endsAt.getTime() <= Date.now()) {
      errors.push({ path: 'endsAt', message: 'The end date has passed' });
    }
    if (errors.length) {
      throw new BadRequestException({
        message: 'This campaign is not ready to submit',
        errors,
      });
    }
  }

  /** The campaign if `user` owns it; 404 otherwise, so ids can't be probed. */
  private async owned(user: AuthUser, id: string): Promise<CampaignRow> {
    const row = await this.prisma.campaign.findUnique({
      where: { id },
      include,
    });
    if (!row || row.ownerId !== user.id) throw new NotFoundException(NOT_FOUND);
    return row;
  }

  private async categoryId(slug: string): Promise<string> {
    const category = await this.prisma.category.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!category) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: [{ path: 'categorySlug', message: 'Unknown category' }],
      });
    }
    return category.id;
  }
}
