import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import type { ImageType } from '../campaigns/image-type.js';
import { CampaignUpdatesService } from './campaign-updates.service.js';
import { UpdateSubscriptions } from './update-subscriptions.js';
import {
  updateInputSchema,
  updatePageSchema,
  uploadInputSchema,
  unsubscribeSchema,
  type UpdateInput,
} from './update.schemas.js';
@Controller()
export class CampaignUpdatesController {
  constructor(
    private readonly updates: CampaignUpdatesService,
    private readonly subscriptions: UpdateSubscriptions,
  ) {}
  @Get('campaigns/:slug/updates')
  @Header('Cache-Control', 'no-store')
  list(
    @Param('slug') slug: string,
    @Query(new ZodValidationPipe(updatePageSchema)) query: { page: number },
  ) {
    return this.updates.publicList(slug, query.page);
  }
  @Get('campaigns/:id/updates/mine')
  @UseGuards(JwtAuthGuard)
  @Header('Cache-Control', 'no-store')
  mine(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query(new ZodValidationPipe(updatePageSchema)) query: { page: number },
  ) {
    return this.updates.ownerList(user, id, query.page);
  }
  @Post('campaigns/:id/updates/images/upload-url')
  @UseGuards(JwtAuthGuard)
  upload(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(uploadInputSchema))
    body: { contentType: ImageType; size: number },
  ) {
    return this.updates.upload(user, id, body.contentType);
  }
  @Post('campaigns/:id/updates')
  @UseGuards(JwtAuthGuard)
  @Header('Cache-Control', 'no-store')
  publish(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateInputSchema)) body: UpdateInput,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.updates.publish(user, id, body, key);
  }
  @Delete('campaign-updates/:id')
  @UseGuards(JwtAuthGuard)
  hide(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.updates.hide(user, id);
  }
  @Delete('admin/campaign-updates/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  moderate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.updates.hide(user, id, true);
  }
  @Post('campaign-update-subscriptions/:id/unsubscribe')
  @Header('Cache-Control', 'no-store')
  unsubscribe(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(unsubscribeSchema)) body: { token: string },
  ) {
    return this.subscriptions.unsubscribe(id, body.token);
  }
}
