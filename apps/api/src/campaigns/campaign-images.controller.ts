import {
  Body,
  Controller,
  Delete,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  CampaignImagesService,
  type PublicImage,
  type UploadTicket,
} from './campaign-images.service.js';
import { IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_IMAGES_PER_CAMPAIGN } from './image-type.js';

const uploadSchema = z.object({
  contentType: z.enum(IMAGE_TYPES, 'Upload a JPEG, PNG or WebP image'),
  size: z.number().int().positive().max(MAX_IMAGE_BYTES, 'Images must be 5 MB or smaller'),
});
const attachSchema = z.object({ key: z.string().min(1).max(300) });
const orderSchema = z.object({
  imageIds: z.array(z.string().min(1).max(50)).min(1).max(MAX_IMAGES_PER_CAMPAIGN),
});

/** Owner-only image management. The images themselves appear on the campaign. */
@Controller('campaigns/:id/images')
@UseGuards(JwtAuthGuard)
export class CampaignImagesController {
  constructor(private readonly images: CampaignImagesService) {}

  @Post('upload-url')
  createUpload(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(uploadSchema)) body: z.infer<typeof uploadSchema>,
  ): Promise<UploadTicket> {
    return this.images.createUpload(user, id, body.contentType);
  }

  @Post()
  attach(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(attachSchema)) body: { key: string },
  ): Promise<PublicImage[]> {
    return this.images.attach(user, id, body.key);
  }

  @Put('order')
  reorder(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(orderSchema)) body: { imageIds: string[] },
  ): Promise<PublicImage[]> {
    return this.images.reorder(user, id, body.imageIds);
  }

  @Delete(':imageId')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('imageId') imageId: string,
  ): Promise<PublicImage[]> {
    return this.images.remove(user, id, imageId);
  }
}
