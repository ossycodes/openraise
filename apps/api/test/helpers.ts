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
