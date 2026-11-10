import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { MAX_IMAGE_BYTES } from '../campaigns/image-type.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { readBody } from '../kyc/kyc.controller.js';
import {
  orgDecisionSchema,
  orgQueueSchema,
  orgSubmissionSchema,
  OrganisationVerificationService,
  type OrgDecision,
  type OrgQueue,
  type OrgSubmission,
} from './organisation-verification.js';

/** Members see the status; owners and admins send the certificate. */
@Controller('organisations')
@UseGuards(JwtAuthGuard)
export class OrganisationVerificationController {
  constructor(private readonly checks: OrganisationVerificationService) {}

  @Get(':id/verification')
  @Header('Cache-Control', 'no-store')
  status(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.checks.status(user, id);
  }

  /** The certificate photo, posted raw with an image Content-Type. */
  @Post(':id/verification/document')
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  async document(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() req: IncomingMessage,
  ) {
    return this.checks.uploadDocument(user, id, await readBody(req, MAX_IMAGE_BYTES));
  }

  @Post(':id/verification')
  @HttpCode(201)
  submit(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(orgSubmissionSchema)) body: OrgSubmission,
  ) {
    return this.checks.submit(user, id, body);
  }
}

@Controller('admin/organisation-checks')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminOrganisationChecksController {
  constructor(private readonly checks: OrganisationVerificationService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  queue(@Query(new ZodValidationPipe(orgQueueSchema)) query: OrgQueue) {
    return this.checks.queue(query);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  detail(@Param('id') id: string) {
    return this.checks.detail(id);
  }

  @Get(':id/document')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', "default-src 'none'")
  async document(@Param('id') id: string) {
    const { bytes, contentType } = await this.checks.document(id);
    return new StreamableFile(Buffer.from(bytes), {
      type: contentType,
      length: bytes.length,
      disposition: 'inline',
    });
  }

  @Post(':id/decision')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  decide(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(orgDecisionSchema)) body: OrgDecision,
  ) {
    return this.checks.decide(user, id, body);
  }
}
