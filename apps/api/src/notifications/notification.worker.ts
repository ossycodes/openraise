import {
  Injectable,
  Logger,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import { NotificationDeliveryService } from './notification-delivery.service.js';

@Injectable()
export class NotificationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationWorker.name);
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private stopping = false;
  constructor(private readonly deliveries: NotificationDeliveryService) {}
  onModuleInit() {
    this.timer = setInterval(() => {
      void this.drain();
    }, 5000);
    this.timer.unref();
    void this.drain();
  }
  drain(): Promise<void> {
    if (this.running) return this.running;
    if (this.stopping) return Promise.resolve();
    this.running = (async () => {
      try {
        await this.deliveries.recoverInterrupted();
        const lane = async () => {
          for (let i = 0; i < 10 && !this.stopping; i++)
            if (!(await this.deliveries.processNext())) break;
        };
        const results = await Promise.allSettled([lane(), lane()]);
        if (results.some((result) => result.status === 'rejected'))
          this.logger.error(
            'Notification delivery interrupted; outbox retained',
          );
      } catch {
        this.logger.error('Notification delivery interrupted; outbox retained');
      }
    })().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }
  async onModuleDestroy() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }
}
