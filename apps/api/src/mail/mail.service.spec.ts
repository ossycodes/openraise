import { ConfigService } from '@nestjs/config';
import { vi } from 'vitest';
import type { Env } from '../config/env.js';
import { MailService } from './mail.service.js';

const { sendMail, createTransport } = vi.hoisted(() => {
  const sendMail = vi.fn();
  return { sendMail, createTransport: vi.fn(() => ({ sendMail })) };
});
vi.mock('nodemailer', () => ({ default: { createTransport } }));
const message = {
  to: 'donor@example.com',
  subject: 'Receipt',
  text: 'Confirmed',
  html: '<p>Confirmed</p>',
  messageId: '<stable@example.com>',
};
function service() {
  return new MailService(
    new ConfigService({
      SMTP_URL: 'smtp://localhost:1025',
      MAIL_FROM: 'OpenRaise <test@example.com>',
    }) as ConfigService<Env, true>,
  );
}

describe('SMTP delivery outcomes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('passes stable message IDs and requires SMTP acceptance', async () => {
    sendMail.mockResolvedValueOnce({ accepted: [message.to] });
    await expect(service().send(message)).resolves.toBeUndefined();
    expect(sendMail).toHaveBeenCalledWith({
      from: 'OpenRaise <test@example.com>',
      ...message,
    });
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        socketTimeout: 30000,
        connectionTimeout: 10000,
      }),
    );
  });
  it.each([
    { responseCode: 451 },
    { responseCode: 503, permanent: false },
    { code: 'ECONNECTION', command: 'CONN', originalCode: 'ECONNREFUSED' },
  ])(
    'permits retry only on a confirmed temporary non-acceptance',
    async (error) => {
      sendMail.mockRejectedValueOnce(error);
      await expect(service().send(message)).rejects.toMatchObject({
        uncertain: false,
        retryable: true,
      });
    },
  );
  it.each([{ responseCode: 550 }, { code: 'EAUTH' }])(
    'classifies permanent rejection without exposing upstream details',
    async (error) => {
      sendMail.mockRejectedValueOnce({
        ...error,
        message: 'private account details',
      });
      await expect(service().send(message)).rejects.toMatchObject({
        uncertain: false,
        retryable: false,
        message: 'Email was not accepted',
      });
    },
  );
  it.each([
    { code: 'ETIMEDOUT', command: 'DATA' },
    { code: 'ECONNECTION', command: 'CONN' },
    new Error('private socket details'),
  ])('holds an ambiguous write rather than resending it', async (error) => {
    sendMail.mockRejectedValueOnce(error);
    await expect(service().send(message)).rejects.toMatchObject({
      uncertain: true,
      message: 'Email delivery outcome is uncertain',
    });
  });
});
