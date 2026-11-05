import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthUser } from '../auth/auth.types.js';
import type { Env } from '../config/env.js';
import type { BankAccount } from '../generated/prisma/client.js';
import { MailService } from '../mail/mail.service.js';
import { payoutAccountAddedEmail } from '../mail/templates.js';
import {
  PAYMENT_PROVIDER,
  type Bank,
  type PaymentProvider,
} from '../payments/payment-provider.js';
import { PaymentProviderError } from '../payments/provider-http.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { namesMatch } from './name-match.js';

export const PAYOUT_HOLD_MS = 24 * 60 * 60 * 1000;
export const MAX_BANK_ACCOUNTS = 5;
const BANK_LIST_TTL_MS = 24 * 60 * 60 * 1000;

export interface AccountLookup {
  bankCode: string;
  accountNumber: string;
}

export interface PublicBankAccount {
  id: string;
  bankCode: string;
  bankName: string;
  accountName: string;
  /** "******1234": the full number is never sent back */
  maskedAccountNumber: string;
  isDefault: boolean;
  recipientUsable: boolean;
  nameMatchesProfile: boolean;
  payoutsAvailableAt: Date;
  createdAt: Date;
}

function toPublic(a: BankAccount): PublicBankAccount {
  return {
    id: a.id,
    bankCode: a.bankCode,
    bankName: a.bankName,
    accountName: a.accountName,
    maskedAccountNumber: `******${a.accountNumber.slice(-4)}`,
    isDefault: a.isDefault,
    recipientUsable: a.recipientUsable,
    nameMatchesProfile: a.nameMatchesProfile,
    payoutsAvailableAt: a.payoutsAvailableAt,
    createdAt: a.createdAt,
  };
}

@Injectable()
export class BankAccountsService {
  private readonly logger = new Logger(BankAccountsService.name);
  private banks: { at: number; list: Bank[] } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider | null,
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Nigerian banks the provider can pay out to, cached for a day. */
  async listBanks(): Promise<Bank[]> {
    const provider = this.requireProvider();
    if (!this.banks || Date.now() - this.banks.at > BANK_LIST_TTL_MS) {
      const list = await this.call(() => provider.listBanks('NG'));
      this.banks = { at: Date.now(), list: [...list].sort((a, b) => a.name.localeCompare(b.name)) };
    }
    return this.banks.list;
  }

  /** Look up the account name before saving, so the user can confirm it. */
  async resolve(input: AccountLookup) {
    const bank = await this.bank(input.bankCode);
    const resolved = await this.call(() =>
      this.requireProvider().resolveAccount({ ...input, country: 'NG' }),
    );
    if (!resolved.resolved) {
      throw new BadRequestException("We couldn't find that account. Check the number and the bank.");
    }
    return {
      bankCode: bank.code,
      bankName: bank.name,
      accountName: resolved.accountName,
      maskedAccountNumber: `******${input.accountNumber.slice(-4)}`,
    };
  }

  async add(user: AuthUser, input: AccountLookup): Promise<PublicBankAccount> {
    if (!user.emailVerified) {
      throw new ForbiddenException('Verify your email before adding a payout account');
    }
    const active = await this.prisma.bankAccount.findMany({
      where: { userId: user.id, removedAt: null },
      select: { bankCode: true, accountNumber: true },
    });
    if (active.some((a) => a.bankCode === input.bankCode && a.accountNumber === input.accountNumber)) {
      throw new ConflictException('This account is already on your profile');
    }
    if (active.length >= MAX_BANK_ACCOUNTS) {
      throw new ConflictException(`You can have at most ${MAX_BANK_ACCOUNTS} payout accounts`);
    }

    const looked = await this.resolve(input);
    const provider = this.requireProvider();
    const recipient = await this.call(() =>
      provider.createRecipient({
        accountNumber: input.accountNumber,
        bankCode: input.bankCode,
        country: 'NG',
        accountName: looked.accountName,
        currency: 'NGN',
        idempotencyKey: `recipient:${user.id}:${input.bankCode}:${input.accountNumber}`,
      }),
    );
    const profile = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { name: true, email: true },
    });

    const account = await this.prisma.bankAccount.create({
      data: {
        userId: user.id,
        bankCode: looked.bankCode,
        bankName: looked.bankName,
        accountNumber: input.accountNumber,
        accountName: looked.accountName,
        provider: provider.name,
        recipientId: recipient.id,
        recipientUsable: recipient.usable,
        nameMatchesProfile: namesMatch(profile.name, looked.accountName),
        isDefault: active.length === 0,
        payoutsAvailableAt: new Date(Date.now() + PAYOUT_HOLD_MS),
      },
    });

    // Tell the owner, so a stolen login can't quietly redirect payouts.
    this.mail
      .send(
        payoutAccountAddedEmail(
          profile.name,
          profile.email,
          `${account.bankName} ******${account.accountNumber.slice(-4)}`,
          new URL('/dashboard/payouts', this.config.get('WEB_URL')).toString(),
        ),
      )
      .catch((error: unknown) => this.logger.error(`Payout account email failed: ${String(error)}`));

    return toPublic(account);
  }

  async list(user: AuthUser): Promise<PublicBankAccount[]> {
    const rows = await this.prisma.bankAccount.findMany({
      where: { userId: user.id, removedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    return rows.map(toPublic);
  }

  async setDefault(user: AuthUser, id: string): Promise<PublicBankAccount[]> {
    await this.owned(user, id);
    await this.prisma.$transaction([
      this.prisma.bankAccount.updateMany({
        where: { userId: user.id, isDefault: true, NOT: { id } },
        data: { isDefault: false },
      }),
      this.prisma.bankAccount.update({ where: { id }, data: { isDefault: true } }),
    ]);
    return this.list(user);
  }

  /** Kept for withdrawal history; the next oldest account becomes the default. */
  async remove(user: AuthUser, id: string): Promise<PublicBankAccount[]> {
    const account = await this.owned(user, id);
    await this.prisma.bankAccount.update({
      where: { id },
      data: { removedAt: new Date(), isDefault: false },
    });
    if (account.isDefault) {
      const next = await this.prisma.bankAccount.findFirst({
        where: { userId: user.id, removedAt: null },
        orderBy: { createdAt: 'asc' },
      });
      if (next) await this.prisma.bankAccount.update({ where: { id: next.id }, data: { isDefault: true } });
    }
    return this.list(user);
  }

  private async owned(user: AuthUser, id: string): Promise<BankAccount> {
    const account = await this.prisma.bankAccount.findFirst({
      where: { id, userId: user.id, removedAt: null },
    });
    if (!account) throw new NotFoundException('Payout account not found');
    return account;
  }

  private async bank(code: string): Promise<Bank> {
    const bank = (await this.listBanks()).find((b) => b.code === code);
    if (!bank) throw new BadRequestException('Unknown bank');
    return bank;
  }

  private requireProvider(): PaymentProvider {
    if (!this.provider) {
      throw new ServiceUnavailableException('Payouts are not set up on this deployment');
    }
    return this.provider;
  }

  /** Provider failures become a 502 without leaking provider details. */
  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof PaymentProviderError) {
        this.logger.warn(`Payment provider ${error.code}${error.status ? ` (${error.status})` : ''}`);
        throw new BadGatewayException('The bank lookup service is unavailable. Try again shortly.');
      }
      throw error;
    }
  }
}
