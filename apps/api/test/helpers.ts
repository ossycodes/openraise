import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { MailService, type MailMessage } from '../src/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

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

export async function createTestApp(): Promise<TestApp> {
  const mail = new FakeMailService();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useValue(mail)
    .compile();
  const app = moduleRef.createNestApplication();
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

/** Sign up a fresh user over HTTP; `admin` promotes them in the database. */
export async function signUpUser(
  t: TestApp,
  options: { admin?: boolean; verified?: boolean } = {},
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
  return user;
}
