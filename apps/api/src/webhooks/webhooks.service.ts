import { createHash } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
  type WebhookHeaders,
} from '../payments/payment-provider.js';
import { PaymentProviderError } from '../payments/provider-http.js';
import { isUniqueViolation, PrismaService } from '../prisma/prisma.service.js';
import { PaymentEventQueue } from './payment-event.queue.js';

@Injectable()
export class WebhooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: PaymentEventQueue,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider | null,
  ) {}
  async accept(name: string, raw: Buffer | undefined, headers: WebhookHeaders) {
    if (!this.provider || name !== this.provider.name)
      throw new NotFoundException();
    if (!raw) throw new BadRequestException('Raw request body required');
    let event;
    try {
      event = this.provider.parseWebhook(raw, headers);
    } catch (error) {
      if (error instanceof PaymentProviderError)
        throw new BadRequestException('Invalid payment event');
      throw error;
    }
    // Persist even unsupported signed events. Never use unverified JSON to choose the provider.
    const payload = JSON.parse(raw.toString('utf8')) as {
      id?: unknown;
      event?: unknown;
      created_at?: unknown;
      data?: { id?: unknown; paid_at?: unknown; created_at?: unknown };
    };
    const eventId =
      event?.id ??
      (name === 'bachs' && typeof payload.id === 'string' ? payload.id : null);
    // Unsupported Paystack events have no canonical top-level id: hash raw bytes for storage only.
    const storageId =
      eventId ?? `ignored-${createHash('sha256').update(raw).digest('hex')}`;
    const sourceTime =
      name === 'bachs'
        ? payload.created_at
        : (payload.data?.paid_at ?? payload.data?.created_at);
    const receivedAt = new Date();
    const occurredAt =
      sourceTime === undefined || sourceTime === null
        ? receivedAt
        : new Date(String(sourceTime));
    if (
      !Number.isFinite(occurredAt.getTime()) ||
      occurredAt.getTime() > Date.now() + 300000
    )
      throw new BadRequestException('Invalid event timestamp');
    let stored;
    try {
      stored = await this.prisma.paymentEvent.create({
        data: {
          provider: name,
          eventId: storageId,
          rawBody: new Uint8Array(raw),
          type: event?.type,
          resourceId: event?.resourceId,
          reference: event?.reference,
          amount: event?.money?.amount,
          currency: event?.money?.currency,
          occurredAt,
          receivedAt,
          ...(!event
            ? {
                processedAt: receivedAt,
                outcome: 'IGNORED',
                reason: 'unsupported-event',
              }
            : {}),
        },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      stored = await this.prisma.paymentEvent.findUniqueOrThrow({
        where: { provider_eventId: { provider: name, eventId: storageId } },
      });
    }
    if (!stored.processedAt) {
      try {
        await this.queue.enqueue(stored.id);
      } catch {
        throw new ServiceUnavailableException(
          'Payment event retained; delivery should retry',
        );
      }
    }
    return { received: true };
  }
}
