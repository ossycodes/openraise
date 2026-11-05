import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { randomToken } from '../common/tokens.js';
import { isUniqueViolation, PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { EDITABLE_STATUSES } from './campaign-status.js';
import {
  IMAGE_EXTENSIONS,
  MAX_IMAGE_BYTES,
  MAX_IMAGES_PER_CAMPAIGN,
  sniffImageType,
  type ImageType,
} from './image-type.js';

const UPLOAD_URL_TTL_SECONDS = 10 * 60;

export interface PublicImage {
  id: string;
  url: string;
  position: number;
  contentType: string;
  size: number;
}

export interface UploadTicket {
  key: string;
  uploadUrl: string;
  method: 'PUT';
  /** Send exactly these headers with the upload */
  headers: Record<string, string>;
  expiresIn: number;
  maxBytes: number;
}

@Injectable()
export class CampaignImagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async list(campaignId: string): Promise<PublicImage[]> {
    const rows = await this.prisma.campaignImage.findMany({
      where: { campaignId },
      orderBy: { position: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      url: this.storage.publicUrl(r.key),
      position: r.position,
      contentType: r.contentType,
      size: r.size,
    }));
  }

  /** Step 1: a presigned URL the browser uploads the file to directly. */
  async createUpload(
    user: AuthUser,
    campaignId: string,
    contentType: ImageType,
  ): Promise<UploadTicket> {
    const campaign = await this.editable(user, campaignId);
    this.assertRoom(campaign.imageCount);
    const key = `campaigns/${campaign.id}/${randomToken(16)}.${IMAGE_EXTENSIONS[contentType]}`;
    return {
      key,
      uploadUrl: await this.storage.presignUpload(key, contentType, UPLOAD_URL_TTL_SECONDS),
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      expiresIn: UPLOAD_URL_TTL_SECONDS,
      maxBytes: MAX_IMAGE_BYTES,
    };
  }

  /**
   * Step 2: attach the uploaded file. Checks what was actually stored (size,
   * and real type from its first bytes) and deletes it if it isn't an
   * acceptable image.
   */
  async attach(user: AuthUser, campaignId: string, key: string): Promise<PublicImage[]> {
    const campaign = await this.editable(user, campaignId);
    if (!key.startsWith(`campaigns/${campaign.id}/`)) {
      throw new BadRequestException('That upload does not belong to this campaign');
    }
    this.assertRoom(campaign.imageCount);

    const stored = await this.storage.head(key);
    if (!stored) throw new BadRequestException('Upload the file before attaching it');
    if (stored.size > MAX_IMAGE_BYTES) {
      await this.storage.deleteQuietly(key);
      throw new BadRequestException('Images must be 5 MB or smaller');
    }
    const type = sniffImageType(await this.storage.readStart(key));
    if (!type) {
      await this.storage.deleteQuietly(key);
      throw new BadRequestException('Upload a JPEG, PNG or WebP image');
    }

    try {
      await this.prisma.campaignImage.create({
        data: {
          campaignId: campaign.id,
          key,
          contentType: type,
          size: stored.size,
          position: campaign.imageCount,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('That image is already attached');
      throw error;
    }
    return this.list(campaign.id);
  }

  /** Set the order; the first image becomes the cover. */
  async reorder(user: AuthUser, campaignId: string, imageIds: string[]): Promise<PublicImage[]> {
    const campaign = await this.editable(user, campaignId);
    const existing = await this.prisma.campaignImage.findMany({
      where: { campaignId: campaign.id },
      select: { id: true },
    });
    const same =
      existing.length === imageIds.length &&
      new Set(imageIds).size === imageIds.length &&
      existing.every((e) => imageIds.includes(e.id));
    if (!same) {
      throw new BadRequestException('List every image of this campaign exactly once');
    }
    await this.prisma.$transaction(
      imageIds.map((id, position) =>
        this.prisma.campaignImage.update({ where: { id }, data: { position } }),
      ),
    );
    return this.list(campaign.id);
  }

  async remove(user: AuthUser, campaignId: string, imageId: string): Promise<PublicImage[]> {
    const campaign = await this.editable(user, campaignId);
    const image = await this.prisma.campaignImage.findFirst({
      where: { id: imageId, campaignId: campaign.id },
    });
    if (!image) throw new NotFoundException('Image not found');

    const rest = await this.prisma.campaignImage.findMany({
      where: { campaignId: campaign.id, id: { not: image.id } },
      orderBy: { position: 'asc' },
      select: { id: true },
    });
    await this.prisma.$transaction([
      this.prisma.campaignImage.delete({ where: { id: image.id } }),
      ...rest.map((r, position) =>
        this.prisma.campaignImage.update({ where: { id: r.id }, data: { position } }),
      ),
    ]);
    await this.storage.deleteQuietly(image.key);
    return this.list(campaign.id);
  }

  private assertRoom(count: number): void {
    if (count >= MAX_IMAGES_PER_CAMPAIGN) {
      throw new ConflictException(
        `A campaign can have at most ${MAX_IMAGES_PER_CAMPAIGN} images`,
      );
    }
  }

  /** The owner's campaign in an editable status; same rules as editing text. */
  private async editable(user: AuthUser, campaignId: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true, ownerId: true, status: true, _count: { select: { images: true } } },
    });
    if (!campaign || campaign.ownerId !== user.id) {
      throw new NotFoundException('Campaign not found');
    }
    if (!EDITABLE_STATUSES.includes(campaign.status)) {
      throw new ConflictException(
        campaign.status === 'PENDING_REVIEW'
          ? 'This campaign is being reviewed; wait for the decision before editing'
          : 'This campaign has ended and can no longer be edited',
      );
    }
    return { id: campaign.id, imageCount: campaign._count.images };
  }
}
