import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';
import type { Env } from '../config/env.js';

export interface MailMessage {
  messageId?: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** SMTP acceptance can be ambiguous; callers must not automatically resend that case. */
export class MailDeliveryError extends Error {
  constructor(
    public readonly uncertain: boolean,
    public readonly retryable = true,
  ) {
    super(
      uncertain
        ? 'Email delivery outcome is uncertain'
        : 'Email was not accepted',
    );
    this.name = 'MailDeliveryError';
  }
}

/**
 * Sends email over SMTP (Mailpit in development). Swapped for a fake in
 * tests; other providers (Resend) arrive with the notifications feature.
 */
@Injectable()
export class MailService {
  private readonly transport: Transporter;
  private readonly from: string;

  constructor(config: ConfigService<Env, true>) {
    this.transport = nodemailer.createTransport({
      url: config.get('SMTP_URL'),
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 30000,
    } as SMTPTransport.Options);
    this.from = config.get('MAIL_FROM');
  }

  async send(message: MailMessage): Promise<void> {
    try {
      const info = await this.transport.sendMail({
        from: this.from,
        ...message,
      });
      if (!Array.isArray(info.accepted)) throw new MailDeliveryError(true);
      if (!info.accepted.length) throw new MailDeliveryError(false, false);
    } catch (error) {
      if (error instanceof MailDeliveryError) throw error;
      const smtp = error as {
        responseCode?: number;
        permanent?: boolean;
        code?: string;
        command?: string;
        originalCode?: string;
        timeoutType?: string;
      };
      if (
        typeof smtp?.responseCode === 'number' &&
        smtp.responseCode >= 400 &&
        smtp.responseCode < 600
      ) {
        throw new MailDeliveryError(
          false,
          typeof smtp.permanent === 'boolean'
            ? !smtp.permanent
            : smtp.responseCode < 500 || smtp.responseCode === 503,
        );
      }
      // Nodemailer can label a disconnect after DATA as ECONNECTION/CONN.
      // Those labels alone do not prove the server failed to accept the message.
      if (
        ['EAUTH', 'EDNS'].includes(smtp?.code ?? '') ||
        smtp?.originalCode === 'ECONNREFUSED' ||
        ['CONNECT_TIMEOUT', 'GREETING_TIMEOUT', 'UPGRADE_TIMEOUT'].includes(
          smtp?.timeoutType ?? '',
        )
      ) {
        throw new MailDeliveryError(false, smtp.code !== 'EAUTH');
      }
      throw new MailDeliveryError(true);
    }
  }
}
