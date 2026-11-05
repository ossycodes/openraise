import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import type { Env } from '../config/env.js';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
} from '../payments/payment-provider.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaymentEventProcessor } from './payment-event.processor.js';

@Injectable()
export class PaymentEventQueue implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentEventQueue.name);
  private queue?: Queue<{ eventId: string }>;
  private worker?: Worker<{ eventId: string }>;
  private timer?: ReturnType<typeof setInterval>;
  private dispatching = false;
  private queueRedis?: Redis;
  private workerRedis?: Redis;
  private lastErrorAt = 0;
  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
    private readonly processor: PaymentEventProcessor,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider | null,
  ) {}

  onModuleInit() {
    if (!this.provider) return;
    const url = this.config.get('REDIS_URL');
    const prefix = this.config.get('PAYMENT_QUEUE_PREFIX');
    this.queueRedis = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 3000,
      commandTimeout: 3000,
    });
    this.workerRedis = new Redis(url, {
      maxRetriesPerRequest: null,
      connectTimeout: 3000,
    });
    this.queue = new Queue('payment-events', {
      connection: this.queueRedis,
      prefix,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
        removeOnFail: 1000,
      },
    });
    this.worker = new Worker(
      'payment-events',
      (job) => this.processor.process(job.data.eventId),
      {
        connection: this.workerRedis,
        prefix,
        concurrency: 4,
      },
    );
    this.queue.on('error', () => this.logUnavailable());
    this.worker.on('error', () => this.logUnavailable());
    this.worker.on('failed', () =>
      this.logger.error(
        'Payment event processing failed; event retained for retry',
      ),
    );
    this.timer = setInterval(() => {
      void this.dispatchPending().catch(() =>
        this.logger.error('Payment event recovery failed'),
      );
    }, 5000);
    this.timer.unref();
    void this.dispatchPending().catch(() =>
      this.logger.error('Payment event recovery failed'),
    );
  }
  private logUnavailable() {
    if (Date.now() - this.lastErrorAt > 10000) {
      this.lastErrorAt = Date.now();
      this.logger.error(
        'Payment event queue or worker unavailable; events retained',
      );
    }
  }
  async enqueue(eventId: string) {
    if (!this.queue || this.queueRedis?.status !== 'ready')
      throw new Error('Payment event queue is not available');
    try {
      const existing = await this.queue.getJob(eventId);
      if (existing && (await existing.isFailed())) await existing.retry();
      else await this.queue.add('process', { eventId }, { jobId: eventId });
    } finally {
      await this.prisma.paymentEvent.updateMany({
        where: { id: eventId },
        data: { lastDispatchAt: new Date() },
      });
    }
  }
  /** The database is the outbox: recover enqueue failures, Redis loss and failed jobs. */
  async dispatchPending() {
    if (!this.queue || this.dispatching) return;
    this.dispatching = true;
    try {
      const events = await this.prisma.paymentEvent.findMany({
        where: { processedAt: null },
        orderBy: [
          { lastDispatchAt: { sort: 'asc', nulls: 'first' } },
          { receivedAt: 'asc' },
        ],
        select: { id: true },
        take: 100,
      });
      for (const event of events) await this.enqueue(event.id);
    } finally {
      this.dispatching = false;
    }
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.worker?.close();
    await this.queue?.close();
    this.queueRedis?.disconnect();
    this.workerRedis?.disconnect();
  }
}
