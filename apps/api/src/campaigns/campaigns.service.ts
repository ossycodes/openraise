import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { FeesService } from '../fees/fees.service.js';
import type { Prisma } from '../generated/prisma/client.js';
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
  type ListCampaignsQuery,
  type UpdateCampaignInput,
} from './campaigns.schemas.js';
import { campaignSlug } from './slug.js';

const include = {
  category: { select: { slug: true, name: true } },
  owner: { select: { id: true, name: true } },
  images: {
    orderBy: { position: 'asc' },
    select: { id: true, key: true, position: true, contentType: true, size: true },
  },
} satisfies Prisma.CampaignInclude;

type CampaignRow = Prisma.CampaignGetPayload<{ include: typeof include }>;

export interface PublicCampaign {
  id: string;
  slug: string;
  title: string;
  summary: string;
  story: string;
  category: { slug: string; name: string };
  owner: { name: string };
  /** Minor units as strings */
  goalAmount: string;
  currency: string;
  /** From the ledger once donations ship (M2) */
  raisedAmount: string;
  donorCount: number;
  beneficiaryName: string | null;
  location: string | null;
  endsAt: Date | null;
  /** In display order; the first is the cover */
  images: { id: string; url: string; position: number; contentType: string; size: number }[];
  coverImageUrl: string | null;
  status: CampaignRow['status'];
  /** Only shown to the owner and admins */
  rejectionReason?: string | null;
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
    category: c.category,
    owner: { name: c.owner.name },
    goalAmount: c.goalAmount.toString(),
    currency: c.currency,
    raisedAmount: '0',
    donorCount: 0,
    beneficiaryName: c.beneficiaryName,
    location: c.location,
    endsAt: c.endsAt,
    images,
    coverImageUrl: images[0]?.url ?? null,
    status: c.status,
    ...(privileged ? { rejectionReason: c.rejectionReason } : {}),
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
  ) {}

  async create(user: AuthUser, input: CreateCampaignInput): Promise<PublicCampaign> {
    const categoryId = await this.categoryId(input.categorySlug);
    const data = {
      ownerId: user.id,
      categoryId,
      title: input.title,
      summary: input.summary ?? '',
      story: input.story ?? '',
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
        return toPublic(row, true, this.storage);
      } catch (error) {
        if (!isUniqueViolation(error) || attempt >= 4) throw error;
      }
    }
  }

  async listPublic(query: ListCampaignsQuery): Promise<CampaignPage> {
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
      items: rows.map((r) => toPublic(r, false, this.storage)),
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  async listMine(user: AuthUser): Promise<PublicCampaign[]> {
    const rows = await this.prisma.campaign.findMany({
      where: { ownerId: user.id },
      include,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => toPublic(r, true, this.storage));
  }

  /**
   * Public campaigns are visible to everyone; drafts, campaigns in review
   * and rejected ones only to their owner and admins. Everyone else gets a
   * 404, so unpublished campaigns can't be discovered by guessing slugs.
   */
  async getBySlug(slug: string, viewer?: AuthUser): Promise<PublicCampaign> {
    const row = await this.prisma.campaign.findUnique({ where: { slug }, include });
    if (!row) throw new NotFoundException(NOT_FOUND);
    const privileged = !!viewer && (viewer.id === row.ownerId || viewer.role === 'ADMIN');
    if (!PUBLIC_STATUSES.includes(row.status) && !privileged) {
      throw new NotFoundException(NOT_FOUND);
    }
    return toPublic(row, privileged, this.storage);
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
      throw new ConflictException('The currency is fixed once a campaign is submitted');
    }

    const { categorySlug, ...fields } = input;
    const data: Prisma.CampaignUncheckedUpdateInput = { ...fields };
    if (categorySlug) data.categoryId = await this.categoryId(categorySlug);

    const updated = await this.prisma.campaign.update({
      where: { id: row.id },
      data,
      include,
    });
    return toPublic(updated, true, this.storage);
  }

  /** Owner actions: submit, pause, resume, end. */
  async ownerAction(
    user: AuthUser,
    id: string,
    action: Exclude<CampaignAction, 'approve' | 'reject'>,
  ): Promise<PublicCampaign> {
    const row = await this.owned(user, id);
    if (action === 'submit') this.assertReadyToSubmit(user, row);

    const now = new Date();
    const extra: Prisma.CampaignUpdateManyMutationInput =
      action === 'submit'
        ? { submittedAt: now, rejectionReason: null }
        : action === 'end'
          ? { endedAt: now }
          : {};
    return this.transition(row.id, action, extra);
  }

  /** Admin review decisions. */
  async approve(id: string): Promise<PublicCampaign> {
    return this.transition(id, 'approve', { publishedAt: new Date() });
  }

  async reject(id: string, reason: string): Promise<PublicCampaign> {
    return this.transition(id, 'reject', { rejectionReason: reason });
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
  ): Promise<PublicCampaign> {
    const { from, to } = TRANSITIONS[action];
    const result = await this.prisma.campaign.updateMany({
      where: { id, status: { in: [...from] } },
      data: { ...extra, status: to },
    });
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
    const row = await this.prisma.campaign.findUniqueOrThrow({ where: { id }, include });
    return toPublic(row, true, this.storage);
  }

  private assertReadyToSubmit(user: AuthUser, row: CampaignRow): void {
    if (!user.emailVerified) {
      throw new ForbiddenException('Verify your email before submitting a campaign');
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
      throw new BadRequestException({ message: 'This campaign is not ready to submit', errors });
    }
  }

  /** The campaign if `user` owns it; 404 otherwise, so ids can't be probed. */
  private async owned(user: AuthUser, id: string): Promise<CampaignRow> {
    const row = await this.prisma.campaign.findUnique({ where: { id }, include });
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
