import { createServer, type Socket } from 'node:net';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { MailService } from './mail.service.js';

/** Local SMTP fixture: no real email leaves this process. */
async function smtpFixture(outcome: 'accepted' | 'rejected' | 'disconnected') {
  const messages: string[] = [];
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.write('220 fixture ESMTP\r\n');
    let pending = '';
    let data = false;
    let body = '';
    socket.on('data', (chunk) => {
      pending += chunk.toString();
      while (pending.includes('\r\n')) {
        const index = pending.indexOf('\r\n');
        const line = pending.slice(0, index);
        pending = pending.slice(index + 2);
        if (data) {
          if (line !== '.') {
            body += `${line}\r\n`;
            continue;
          }
          messages.push(body);
          data = false;
          if (outcome === 'disconnected') socket.destroy();
          else
            socket.write(
              outcome === 'accepted'
                ? '250 2.0.0 Accepted\r\n'
                : '451 4.3.0 Try later\r\n',
            );
        } else if (line.startsWith('EHLO') || line.startsWith('HELO'))
          socket.write('250 fixture\r\n');
        else if (line === 'DATA') {
          data = true;
          socket.write('354 Send message\r\n');
        } else if (line === 'QUIT') socket.end('221 Goodbye\r\n');
        else socket.write('250 OK\r\n');
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Fixture did not bind');
  const mail = new MailService(
    new ConfigService({
      SMTP_URL: `smtp://127.0.0.1:${address.port}`,
      MAIL_FROM: 'test@example.com',
    }) as ConfigService<Env, true>,
  );
  return {
    mail,
    messages,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
const message = {
  to: 'donor@example.com',
  subject: 'Receipt',
  text: 'Payment confirmed',
  html: '<p>Payment confirmed</p>',
  messageId: '<receipt-example@receipts.openraise.local>',
};

it('sends through the real SMTP adapter with a stable Message-ID', async () => {
  const fixture = await smtpFixture('accepted');
  try {
    await fixture.mail.send(message);
    expect(fixture.messages).toHaveLength(1);
    expect(fixture.messages[0]).toContain(`Message-ID: ${message.messageId}`);
  } finally {
    await fixture.close();
  }
});
it.each(['rejected', 'disconnected'] as const)(
  'classifies a real SMTP %s outcome',
  async (outcome) => {
    const fixture = await smtpFixture(outcome);
    try {
      await expect(fixture.mail.send(message)).rejects.toMatchObject({
        uncertain: outcome === 'disconnected',
      });
      expect(fixture.messages).toHaveLength(1);
    } finally {
      await fixture.close();
    }
  },
);
