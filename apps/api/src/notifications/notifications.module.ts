import { Module } from '@nestjs/common';
import { NotificationScheduler } from './notification-scheduler.js';
import { NotificationDeliveryService } from './notification-delivery.service.js';
import { NotificationWorker } from './notification.worker.js';
@Module({
  providers: [
    NotificationScheduler,
    NotificationDeliveryService,
    NotificationWorker,
  ],
  exports: [NotificationScheduler],
})
export class NotificationsModule {}
