import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  createCampaignSchema,
  listCampaignsSchema,
  recentlyFundedSchema,
  rejectCampaignSchema,
  updateCampaignSchema,
  type CreateCampaignInput,
  type ListCampaignsQuery,
  type RecentlyFundedQuery,
  type UpdateCampaignInput,
} from './campaigns.schemas.js';
import {
  CampaignsService,
  type CampaignPage,
  type PublicCampaign,
} from './campaigns.service.js';

/**
 * Reads use the public slug; writes use the id, which only the owner's
 * dashboard (and admins) see.
 */
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createCampaignSchema))
    body: CreateCampaignInput,
  ): Promise<PublicCampaign> {
    return this.campaigns.create(user, body);
  }

  @Get()
  list(
    @Query(new ZodValidationPipe(listCampaignsSchema))
    query: ListCampaignsQuery,
  ): Promise<CampaignPage> {
    return this.campaigns.listPublic(query);
  }

  /**
   * Campaigns that recently reached their goal, for the homepage. Every real
   * slug ends in a 5-character suffix, so this path never shadows one.
   */
  @Get('recently-funded')
  recentlyFunded(
    @Query(new ZodValidationPipe(recentlyFundedSchema))
    query: RecentlyFundedQuery,
  ) {
    return this.campaigns.listRecentlyFunded(query.limit);
  }

  // Declared before ':slug' so "mine" isn't read as a slug.
  @Get('mine')
  @UseGuards(JwtAuthGuard)
  mine(@CurrentUser() user: AuthUser): Promise<PublicCampaign[]> {
    return this.campaigns.listMine(user);
  }

  @Get(':slug')
  @UseGuards(OptionalJwtAuthGuard)
  get(
    @Param('slug') slug: string,
    @Req() request: Request & { user?: AuthUser },
  ): Promise<PublicCampaign> {
    return this.campaigns.getBySlug(slug, request.user);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCampaignSchema))
    body: UpdateCampaignInput,
  ): Promise<PublicCampaign> {
    return this.campaigns.update(user, id, body);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<void> {
    await this.campaigns.remove(user, id);
  }

  @Post(':id/submit')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  submit(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<PublicCampaign> {
    return this.campaigns.ownerAction(user, id, 'submit');
  }

  @Post(':id/pause')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  pause(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<PublicCampaign> {
    return this.campaigns.ownerAction(user, id, 'pause');
  }

  @Post(':id/resume')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  resume(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<PublicCampaign> {
    return this.campaigns.ownerAction(user, id, 'resume');
  }

  @Post(':id/end')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  end(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<PublicCampaign> {
    return this.campaigns.ownerAction(user, id, 'end');
  }

  @Post(':id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<PublicCampaign> {
    return this.campaigns.approve(id, user);
  }

  @Post(':id/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(rejectCampaignSchema)) body: { reason: string },
  ): Promise<PublicCampaign> {
    return this.campaigns.reject(id, body.reason, user);
  }
}
