import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { AuthUser } from '../auth/auth.types.js';
import { StorageService } from '../storage/storage.service.js';
import { isUniqueViolation, PrismaService } from '../prisma/prisma.service.js';
import {
  IMAGE_EXTENSIONS,
  MAX_IMAGE_BYTES,
  sniffImageType,
  type ImageType,
} from '../campaigns/image-type.js';
import type { Prisma } from '../generated/prisma/client.js';
import { idempotencyKeySchema } from '../donations/donations.schemas.js';
import type { UpdateInput } from './update.schemas.js';
const PUBLIC = ['ACTIVE', 'PAUSED', 'ENDED'] as const;
const include = {
  images: { orderBy: { position: 'asc' as const } },
} satisfies Prisma.CampaignUpdateInclude;
type Row = Prisma.CampaignUpdateGetPayload<{ include: typeof include }>;
@Injectable()
export class CampaignUpdatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}
  private present(row: Row) {
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      publishedAt: row.publishedAt,
      hiddenAt: row.hiddenAt,
      images: row.images.map((i) => ({
        id: i.id,
        url: this.storage.publicUrl(i.key),
        position: i.position,
      })),
    };
  }
  private async owned(user: AuthUser, id: string) {
    const c = await this.prisma.campaign.findFirst({
      where: { id, ownerId: user.id },
    });
    if (!c) throw new NotFoundException('Campaign not found');
    return c;
  }
  private assertPublic(status: string) {
    if (!(PUBLIC as readonly string[]).includes(status))
      throw new ConflictException(
        'Publish your campaign before posting updates',
      );
  }
  async publicList(slug: string, page: number) {
    const c = await this.prisma.campaign.findFirst({
      where: { slug, status: { in: [...PUBLIC] } },
      select: { id: true },
    });
    if (!c) throw new NotFoundException('Campaign not found');
    return this.list(c.id, page, false);
  }
  async ownerList(user: AuthUser, id: string, page: number) {
    await this.owned(user, id);
    return this.list(id, page, true);
  }
  private async list(campaignId: string, page: number, owner: boolean) {
    const rows = await this.prisma.campaignUpdate.findMany({
      where: { campaignId, ...(owner ? {} : { hiddenAt: null }) },
      include,
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * 10,
      take: 11,
    });
    return {
      items: rows.slice(0, 10).map((r) => this.present(r)),
      page,
      hasMore: rows.length > 10,
    };
  }
  async upload(user: AuthUser, id: string, type: ImageType) {
    const c = await this.owned(user, id);
    this.assertPublic(c.status);
    if (!user.emailVerified)
      throw new ForbiddenException('Verify your email before posting updates');
    const key = `campaign-updates/${id}/uploads/${randomUUID().replaceAll('-', '')}.${IMAGE_EXTENSIONS[type]}`;
    return {
      key,
      uploadUrl: await this.storage.presignUpload(key, type, 600),
      method: 'PUT',
      headers: { 'Content-Type': type },
      maxBytes: MAX_IMAGE_BYTES,
    };
  }
  async publish(
    user: AuthUser,
    id: string,
    body: UpdateInput,
    key: string | undefined,
  ) {
    if (!user.emailVerified)
      throw new ForbiddenException('Verify your email before posting updates');
    const parsed = idempotencyKeySchema.safeParse(key);
    if (!parsed.success)
      throw new BadRequestException('Use a UUID v4 Idempotency-Key');
    const hash = createHash('sha256')
      .update(`${user.id}:${parsed.data}`)
      .digest('hex');
    const prior = () =>
      this.prisma.campaignUpdate.findUnique({
        where: { idempotencyKeyHash: hash },
        include,
      });
    const replay = (row: Row) => {
      if (
        row.campaignId !== id ||
        row.title !== body.title ||
        row.body !== body.body ||
        JSON.stringify(row.uploadKeys) !== JSON.stringify(body.imageKeys)
      )
        throw new ConflictException(
          'This request key was used for a different update',
        );
      return this.present(row);
    };
    const existing = await prior();
    if (existing) return replay(existing);
    const c = await this.owned(user, id);
    this.assertPublic(c.status);
    const images: {
      key: string;
      contentType: string;
      size: number;
      position: number;
    }[] = [];
    try {
      for (const [position, source] of body.imageKeys.entries()) {
        const prefix = `campaign-updates/${id}/uploads/`;
        const suffix = source.slice(prefix.length);
        if (
          !source.startsWith(prefix) ||
          !/^[a-f0-9]{32}\.(jpg|png|webp)$/.test(suffix)
        )
          throw new BadRequestException('Choose an upload from this campaign');
        const sourceObject = await this.storage.head(source);
        if (
          !sourceObject ||
          sourceObject.size <= 0 ||
          sourceObject.size > MAX_IMAGE_BYTES
        )
          throw new BadRequestException(
            'Upload a JPEG, PNG or WebP photo up to 5 MB first',
          );
        const destination = `campaign-updates/${id}/published/${randomUUID()}.${suffix.split('.').at(-1)}`;
        await this.storage.copy(source, destination);
        // Validate the immutable server-owned copy, not a still-writable upload URL.
        images.push({ key: destination, contentType: '', size: 0, position });
        const stored = await this.storage.head(destination);
        const type = stored
          ? sniffImageType(await this.storage.readStart(destination))
          : null;
        if (
          !stored ||
          stored.size <= 0 ||
          stored.size > MAX_IMAGE_BYTES ||
          !type ||
          IMAGE_EXTENSIONS[type] !== suffix.split('.').at(-1)
        )
          throw new BadRequestException(
            'Use JPEG, PNG or WebP photos up to 5 MB',
          );
        Object.assign(images[images.length - 1]!, {
          contentType: type,
          size: stored.size,
        });
      }
      const row = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Campaign" WHERE "id"=${id} FOR SHARE`;
        const current = await tx.campaign.findFirst({
          where: { id, ownerId: user.id },
        });
        if (!current) throw new NotFoundException('Campaign not found');
        this.assertPublic(current.status);
        return tx.campaignUpdate.create({
          data: {
            campaignId: id,
            authorId: user.id,
            title: body.title,
            body: body.body,
            uploadKeys: body.imageKeys,
            idempotencyKeyHash: hash,
            images: { create: images },
          },
          include,
        });
      });
      return this.present(row);
    } catch (error) {
      await Promise.allSettled(
        images.map((i) => this.storage.deleteQuietly(i.key)),
      );
      if (isUniqueViolation(error)) {
        const row = await prior();
        if (row) return replay(row);
      }
      throw error;
    }
  }
  async hide(user: AuthUser, updateId: string, admin = false) {
    return this.prisma.$transaction(async (tx) => {
      const update = await tx.campaignUpdate.findFirst({
        where: {
          id: updateId,
          ...(admin ? {} : { campaign: { ownerId: user.id } }),
        },
      });
      if (!update) throw new NotFoundException('Update not found');
      await tx.campaignUpdate.update({
        where: { id: update.id },
        data: {
          hiddenAt: update.hiddenAt ?? new Date(),
          hiddenById: update.hiddenById ?? user.id,
          fanoutCompletedAt: new Date(),
        },
      });
      await tx.notificationDelivery.updateMany({
        where: { campaignUpdateId: update.id, state: 'PENDING' },
        data: { state: 'FAILED', lastError: 'update-removed' },
      });
      return { removed: true };
    });
  }
}
