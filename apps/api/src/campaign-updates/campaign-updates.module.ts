import { Module } from '@nestjs/common';
import { CampaignUpdatesController } from './campaign-updates.controller.js';
import { CampaignUpdatesService } from './campaign-updates.service.js';
import { UpdateSubscriptions } from './update-subscriptions.js';
import { UpdateFanout } from './update-fanout.js';
import { CampaignUpdateWorker } from './update.worker.js';
@Module({
  controllers: [CampaignUpdatesController],
  providers: [
    CampaignUpdatesService,
    UpdateSubscriptions,
    UpdateFanout,
    CampaignUpdateWorker,
  ],
  exports: [UpdateSubscriptions],
})
export class CampaignUpdatesModule {}
