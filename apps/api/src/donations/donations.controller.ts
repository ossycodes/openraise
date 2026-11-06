import {
  Body,
  Controller,
  Get,
  Headers,
  Header,
  Param,
  Post,
  Req,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import type { AuthUser } from '../auth/auth.types.js';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  donationInputSchema,
  type DonationInput,
} from './donations.schemas.js';
import { DonationsService } from './donations.service.js';

@Controller()
export class DonationsController {
  constructor(private readonly donations: DonationsService) {}
  @Get('admin/donations/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Header('Cache-Control', 'no-store')
  adminDetails(@Param('id') id: string) {
    return this.donations.adminDetails(id);
  }
  @Get('campaigns/:slug/donations')
  @Header('Cache-Control', 'no-store')
  publicSupporters(@Param('slug') slug: string, @Query('sort') sort?: string) {
    return this.donations.publicSupporters(slug, sort);
  }
  @Post('campaigns/:slug/donations/quote')
  quote(
    @Param('slug') slug: string,
    @Body(new ZodValidationPipe(donationInputSchema)) body: DonationInput,
  ) {
    return this.donations.quote(slug, body);
  }
  @Post('campaigns/:slug/donations/checkout')
  @Header('Cache-Control', 'no-store')
  @UseGuards(OptionalJwtAuthGuard)
  checkout(
    @Param('slug') slug: string,
    @Body(new ZodValidationPipe(donationInputSchema)) body: DonationInput,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: Request & { user?: AuthUser },
  ) {
    return this.donations.checkout(slug, body, key, request.user);
  }
  @Get('donations/:id')
  @Header('Cache-Control', 'no-store')
  status(
    @Param('id') id: string,
    @Headers('x-donation-token') token: string | undefined,
  ) {
    return this.donations.getStatus(id, token);
  }
}
