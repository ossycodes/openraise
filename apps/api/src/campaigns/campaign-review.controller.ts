import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CampaignsService } from './campaigns.service.js';
import {
  reviewDecisionSchema,
  reviewQueueSchema,
  type ReviewDecisionInput,
  type ReviewQueueQuery,
} from './review.schemas.js';
@Controller('admin/campaigns')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class CampaignReviewController {
  constructor(private readonly campaigns: CampaignsService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  queue(
    @Query(new ZodValidationPipe(reviewQueueSchema)) query: ReviewQueueQuery,
  ) {
    return this.campaigns.reviewQueue(query);
  }
  @Get(':id')
  @Header('Cache-Control', 'no-store')
  detail(@Param('id') id: string) {
    return this.campaigns.reviewDetail(id);
  }
  @Post(':id/review')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  decide(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reviewDecisionSchema))
    body: ReviewDecisionInput,
  ) {
    return this.campaigns.decideReview(
      user,
      id,
      body.decision,
      body.reason,
      body.expectedUpdatedAt,
    );
  }
}
