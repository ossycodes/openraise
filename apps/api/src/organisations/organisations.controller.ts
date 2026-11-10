import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  createOrganisationSchema,
  inviteSchema,
  roleSchema,
  tokenSchema,
  updateOrganisationSchema,
  type CreateOrganisationInput,
  type InviteInput,
  type RoleInput,
  type TokenInput,
  type UpdateOrganisationInput,
} from './organisations.schemas.js';
import { OrganisationsService } from './organisations.service.js';

/**
 * Public profiles by slug; everything else is for members, by id, and a
 * non-member gets 404 so private organisations can't be probed.
 */
@Controller('organisations')
export class OrganisationsController {
  constructor(private readonly orgs: OrganisationsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(201)
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createOrganisationSchema)) body: CreateOrganisationInput,
  ) {
    return this.orgs.create(user, body);
  }

  // Declared before ':slug' so "mine" isn't read as a slug.
  @Get('mine')
  @UseGuards(JwtAuthGuard)
  @Header('Cache-Control', 'no-store')
  mine(@CurrentUser() user: AuthUser) {
    return this.orgs.mine(user);
  }

  @Get(':slug')
  profile(@Param('slug') slug: string) {
    return this.orgs.profile(slug);
  }

  @Get(':id/manage')
  @UseGuards(JwtAuthGuard)
  @Header('Cache-Control', 'no-store')
  manage(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.orgs.manage(user, id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateOrganisationSchema)) body: UpdateOrganisationInput,
  ) {
    return this.orgs.update(user, id, body);
  }

  @Post(':id/invites')
  @UseGuards(JwtAuthGuard)
  @HttpCode(201)
  invite(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(inviteSchema)) body: InviteInput,
  ) {
    return this.orgs.invite(user, id, body);
  }

  @Delete(':id/invites/:inviteId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  revokeInvite(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('inviteId') inviteId: string,
  ) {
    return this.orgs.revokeInvite(user, id, inviteId);
  }

  @Patch(':id/members/:memberId')
  @UseGuards(JwtAuthGuard)
  changeRole(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Body(new ZodValidationPipe(roleSchema)) body: RoleInput,
  ) {
    return this.orgs.changeRole(user, id, memberId, body.role);
  }

  @Delete(':id/members/:memberId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('memberId') memberId: string,
  ) {
    return this.orgs.remove(user, id, memberId);
  }
}

/** Invitation links. The token travels in the body, never the URL path. */
@Controller('organisation-invites')
export class OrganisationInvitesController {
  constructor(private readonly orgs: OrganisationsService) {}

  @Post('preview')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  preview(@Body(new ZodValidationPipe(tokenSchema)) body: TokenInput) {
    return this.orgs.previewInvite(body.token);
  }

  @Post('accept')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  accept(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(tokenSchema)) body: TokenInput,
  ) {
    return this.orgs.acceptInvite(user, body.token);
  }
}
