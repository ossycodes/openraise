import { CampaignReviewController } from './campaign-review.controller.js';
import { Module } from '@nestjs/common';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CampaignImagesController } from './campaign-images.controller.js';
import { CampaignImagesService } from './campaign-images.service.js';
import { CampaignsController } from './campaigns.controller.js';
import { CampaignsService } from './campaigns.service.js';
import { KycModule } from '../kyc/kyc.module.js';

@Module({
  imports: [KycModule],
  controllers: [
    CampaignReviewController,
    CampaignsController,
    CampaignImagesController,
  ],
  providers: [
    CampaignsService,
    CampaignImagesService,
    RolesGuard,
    OptionalJwtAuthGuard,
  ],
  exports: [CampaignsService],
})
export class CampaignsModule {}
