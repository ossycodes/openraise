import {
  Injectable,
  Logger,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import { UpdateFanout } from './update-fanout.js';
@Injectable()
export class CampaignUpdateWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private stopping = false;
  private readonly log = new Logger(CampaignUpdateWorker.name);
  constructor(private readonly fanout: UpdateFanout) {}
  onModuleInit() {
    this.timer = setInterval(() => {
      void this.drain();
    }, 5000);
    this.timer.unref();
    void this.drain();
  }
  drain() {
    if (this.running) return this.running;
    if (this.stopping) return Promise.resolve();
    this.running = (async () => {
      try {
        for (let i = 0; i < 5 && !this.stopping; i++)
          if (!(await this.fanout.nextBatch())) break;
      } catch {
        this.log.error(
          'Campaign update dispatch interrupted; durable work retained',
        );
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
