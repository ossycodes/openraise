import { CampaignUpdatesModule } from '../campaign-updates/campaign-updates.module.js';
import { Module } from '@nestjs/common';
import { NotificationScheduler } from './notification-scheduler.js';
import { NotificationDeliveryService } from './notification-delivery.service.js';
import { NotificationWorker } from './notification.worker.js';
@Module({
  imports: [CampaignUpdatesModule],
  providers: [
    NotificationScheduler,
    NotificationDeliveryService,
    NotificationWorker,
  ],
  exports: [NotificationScheduler],
})
export class NotificationsModule {}
