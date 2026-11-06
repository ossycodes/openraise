import { RateLimitGuard } from '../src/rate-limit/rate-limit.guard.js';
import { CampaignUpdateWorker } from '../src/campaign-updates/update.worker.js';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { MailService, type MailMessage } from '../src/mail/mail.service.js';
import {
  PAYMENT_PROVIDER,
  type AccountInput,
  type Bank,
  type PaymentProvider,
  type Recipient,
  type RecipientInput,
  type ResolvedAccount,
} from '../src/payments/payment-provider.js';
import { PaymentProviderError } from '../src/payments/provider-http.js';
import { PaymentEventQueue } from '../src/webhooks/payment-event.queue.js';
import { NotificationWorker } from '../src/notifications/notification.worker.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * Stands in for Paystack/Bachs in tests that need a provider. Only the bank
 * and recipient calls are implemented; anything else throws so a test can't
 * pass by accident.
 */
export class FakePaymentProvider implements PaymentProvider {
  readonly name = 'paystack' as const;
  readonly minimumCheckout = { NGN: 0n, USD: 0n, GHS: 0n, KES: 0n };
  banks: Bank[] = [
    { code: '058', name: 'GTBank' },
    { code: '044', name: 'Access Bank' },
  ];
  /** "bankCode:accountNumber" → account name */
  readonly accounts = new Map<string, string>();
  readonly recipients: RecipientInput[] = [];
  /** Make the next provider call fail like a network error. */
  failNext = false;

  private maybeFail(): void {
    if (this.failNext) {
      this.failNext = false;
      throw new PaymentProviderError('transport-error');
    }
  }

  listBanks(): Promise<Bank[]> {
    this.maybeFail();
    return Promise.resolve(this.banks);
  }

  resolveAccount(input: AccountInput): Promise<ResolvedAccount> {
    this.maybeFail();
    const name = this.accounts.get(`${input.bankCode}:${input.accountNumber}`);
    return Promise.resolve(
      name
        ? {
            resolved: true,
            accountNumber: input.accountNumber,
            accountName: name,
          }
        : { resolved: false },
    );
  }

  createRecipient(input: RecipientInput): Promise<Recipient> {
    this.maybeFail();
    this.recipients.push(input);
    return Promise.resolve({
      id: `RCP_${this.recipients.length}`,
      usable: true,
    });
  }

  private unsupported(): never {
    throw new Error('Not implemented in FakePaymentProvider');
  }
  createCheckout = () => this.unsupported();
  verifyPayment = () => this.unsupported();
  verifyWebhook = () => this.unsupported();
  parseWebhook = () => this.unsupported();
  createPayout = () => this.unsupported();
  refund = () => this.unsupported();
}

export class FakeMailService {
  readonly sent: MailMessage[] = [];

  send(message: MailMessage): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }

  lastTo(to: string): MailMessage | undefined {
    return this.sent.findLast((m) => m.to === to);
  }

  /** The `token` query parameter from the last link emailed to `to`. */
  tokenFor(to: string): string {
    const text = this.lastTo(to)?.text ?? '';
    const match = /[?&]token=([A-Za-z0-9_-]+)/.exec(text);
    if (!match?.[1]) throw new Error(`No token emailed to ${to}`);
    return match[1];
  }
}

export interface TestApp {
  app: INestApplication;
  mail: FakeMailService;
  prisma: PrismaService;
  http: () => ReturnType<typeof request>;
}

/**
 * `paymentProvider` swaps in a fake (e.g. FakePaymentProvider); without it the
 * app runs with payments disabled, as the e2e env configures.
 */
export async function createTestApp(
  options: {
    paymentProvider?: PaymentProvider | null;
    backgroundJobs?: boolean;
    rateLimiting?: boolean;
    /** Any other provider to replace, e.g. Google's signing keys. */
    overrides?: { provide: unknown; useValue: unknown }[];
  } = {},
): Promise<TestApp> {
  const mail = new FakeMailService();
  const builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useValue(mail);
  for (const o of options.overrides ?? []) {
    builder.overrideProvider(o.provide as never).useValue(o.useValue);
  }
  if (Object.hasOwn(options, 'paymentProvider'))
    builder
      .overrideProvider(PAYMENT_PROVIDER)
      .useValue(options.paymentProvider);
  if (!options.backgroundJobs)
    builder
      .overrideProvider(PaymentEventQueue)
      .useValue({ enqueue: async () => {} });
  if (!options.backgroundJobs)
    builder.overrideProvider(NotificationWorker).useValue({});
  if (!options.backgroundJobs)
    builder.overrideProvider(CampaignUpdateWorker).useValue({});
  if (!options.rateLimiting)
    builder
      .overrideProvider(RateLimitGuard)
      .useValue({ canActivate: () => true });
  const moduleRef = await builder.compile();
  moduleRef
    .get(ConfigService)
    .set('RATE_LIMIT_PREFIX', `e2e-rate-${randomUUID()}`);
  if (options.backgroundJobs)
    moduleRef
      .get(ConfigService)
      .set('PAYMENT_QUEUE_PREFIX', `e2e-${randomUUID()}`);
  const app = moduleRef.createNestApplication({ rawBody: true });
  await app.init();
  return {
    app,
    mail,
    prisma: app.get(PrismaService),
    http: () => request(app.getHttpServer()),
  };
}

export function uniqueEmail(): string {
  return `user-${randomUUID()}@example.com`;
}

export interface TestUser {
  id: string;
  email: string;
  accessToken: string;
  refreshToken: string;
}

/**
 * Sign up a fresh user over HTTP; `admin` promotes them in the database.
 * `verified` confirms their email and, unless `identity: false`, records a
 * verified identity named "Test User", so they can submit and withdraw.
 */
export async function signUpUser(
  t: TestApp,
  options: { admin?: boolean; verified?: boolean; identity?: boolean } = {},
): Promise<TestUser> {
  const email = uniqueEmail();
  const res = await t
    .http()
    .post('/auth/signup')
    .send({ name: 'Test User', email, password: 'a long enough password' })
    .expect(201);
  const user: TestUser = {
    id: res.body.user.id as string,
    email,
    accessToken: res.body.accessToken as string,
    refreshToken: res.body.refreshToken as string,
  };
  if (options.admin || options.verified) {
    await t.prisma.user.update({
      where: { id: user.id },
      data: {
        ...(options.admin ? { role: 'ADMIN' as const } : {}),
        ...(options.verified ? { emailVerifiedAt: new Date() } : {}),
      },
    });
  }
  if (options.verified && options.identity !== false) {
    await t.prisma.identityVerification.create({
      data: {
        userId: user.id,
        provider: 'manual',
        status: 'VERIFIED',
        documentType: 'NIN_SLIP',
        idNumberLast4: '1234',
        legalName: 'Test User',
        dateOfBirth: new Date('1990-01-01T00:00:00Z'),
        verifiedName: 'Test User',
        decidedAt: new Date(),
      },
    });
  }
  return user;
}
