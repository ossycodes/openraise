import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ReportsService } from './reports.service.js';
import {
  reportInputSchema,
  reportsQuerySchema,
  moderationInputSchema,
  type ReportInput,
  type ReportsQuery,
  type ModerationInput,
} from './reports.schemas.js';
@Controller('campaigns')
export class PublicReportsController {
  constructor(private readonly reports: ReportsService) {}
  @Post(':slug/reports')
  @HttpCode(202)
  @Header('Cache-Control', 'no-store')
  submit(
    @Param('slug') slug: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body(new ZodValidationPipe(reportInputSchema)) body: ReportInput,
  ) {
    return this.reports.submit(slug, body, key);
  }
}
@Controller('admin/reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminReportsController {
  constructor(private readonly reports: ReportsService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  queue(@Query(new ZodValidationPipe(reportsQuerySchema)) query: ReportsQuery) {
    return this.reports.queue(query);
  }
  @Get(':id')
  @Header('Cache-Control', 'no-store')
  detail(@Param('id') id: string) {
    return this.reports.detail(id);
  }
  @Post(':id/actions')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  moderate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(moderationInputSchema)) body: ModerationInput,
  ) {
    return this.reports.moderate(user, id, body);
  }
}
