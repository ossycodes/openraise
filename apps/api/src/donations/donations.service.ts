import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { isCurrency, type Currency } from '@openraise/shared';
import type { AuthUser } from '../auth/auth.types.js';
import type { Env } from '../config/env.js';
import { FeesService } from '../fees/fees.service.js';
import type { Donation } from '../generated/prisma/client.js';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
} from '../payments/payment-provider.js';
import { PaymentProviderError } from '../payments/provider-http.js';
import { isUniqueViolation, PrismaService } from '../prisma/prisma.service.js';
import {
  idempotencyKeySchema,
  type DonationInput,
} from './donations.schemas.js';

const MAX_MONEY = 9_223_372_036_854_775_807n;

@Injectable()
export class DonationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fees: FeesService,
    private readonly config: ConfigService<Env, true>,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider | null,
  ) {}

  async publicSupporters(slug: string, sort = 'recent') {
    if (!['recent', 'top'].includes(sort))
      throw new BadRequestException('Use recent or top sorting');
    const campaign = await this.prisma.campaign.findFirst({
      where: { slug, status: { in: ['ACTIVE', 'PAUSED', 'ENDED'] } },
      select: { id: true },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    if (sort === 'top') {
      const groups = await this.prisma.donation.groupBy({
        by: ['donorEmail', 'currency'],
        where: {
          campaignId: campaign.id,
          status: 'SUCCEEDED',
          ledgerTransactionId: { not: null },
          succeededAt: { not: null },
        },
        _sum: { amount: true },
        _max: { succeededAt: true },
        orderBy: [
          { _sum: { amount: 'desc' } },
          { _max: { succeededAt: 'desc' } },
        ],
        take: 6,
      });
      return {
        items: groups.map((group, index) => ({
          id: `rank-${index + 1}`,
          amount: group._sum.amount!.toString(),
          currency: group.currency,
          confirmedAt: group._max.succeededAt!.toISOString(),
        })),
      };
    }
    const donations = await this.prisma.donation.findMany({
      where: {
        campaignId: campaign.id,
        status: 'SUCCEEDED',
        ledgerTransactionId: { not: null },
        succeededAt: { not: null },
      },
      select: {
        id: true,
        amount: true,
        currency: true,
        succeededAt: true,
        donorName: true,
        donorMessage: true,
        isAnonymous: true,
      },
      orderBy: [{ succeededAt: 'desc' }, { id: 'desc' }],
      take: 6,
    });
    return {
      items: donations.map(
        ({
          id,
          amount,
          currency,
          succeededAt,
          donorName,
          donorMessage,
          isAnonymous,
        }) => ({
          id,
          amount: amount.toString(),
          currency,
          confirmedAt: succeededAt!.toISOString(),
          displayName:
            isAnonymous !== false ? 'Anonymous' : (donorName ?? 'A supporter'),
          message: donorMessage,
        }),
      ),
    };
  }

  async adminDetails(id: string) {
    const donation = await this.prisma.donation.findUnique({
      where: { id },
      select: {
        id: true,
        campaignId: true,
        donorName: true,
        donorMessage: true,
        isAnonymous: true,
        status: true,
        currency: true,
        amount: true,
      },
    });
    if (!donation) throw new NotFoundException('Donation not found');
    return { ...donation, amount: donation.amount.toString() };
  }
  private async breakdown(body: DonationInput, code: string) {
    if (!this.provider)
      throw new ServiceUnavailableException('Payments are disabled');
    if (!isCurrency(code) || (body.currency && body.currency !== code))
      throw new BadRequestException('Use the campaign currency');
    const fees = await this.fees.donation(BigInt(body.amount), {
      donorCoversPlatformFee: body.donorCoversPlatformFee,
    });
    if (fees.amount < this.provider.minimumCheckout[code])
      throw new BadRequestException({
        message: 'Amount is below provider minimum',
        minimumAmount: this.provider.minimumCheckout[code].toString(),
        currency: code,
      });
    if (
      fees.totalCharged > MAX_MONEY ||
      (this.provider.name === 'paystack' &&
        fees.totalCharged > BigInt(Number.MAX_SAFE_INTEGER))
    )
      throw new BadRequestException('Amount is too large');
    return { ...fees, currency: code };
  }
  private serialize(fees: {
    amount: bigint;
    platformFee: bigint;
    donorFee: bigint;
    totalCharged: bigint;
    netToCampaign: bigint;
    donorCoversPlatformFee: boolean;
    currency: string;
  }) {
    return {
      amount: fees.amount.toString(),
      currency: fees.currency,
      platformFee: fees.platformFee.toString(),
      donorFee: fees.donorFee.toString(),
      totalCharged: fees.totalCharged.toString(),
      netToCampaign: fees.netToCampaign.toString(),
      donorCoversPlatformFee: fees.donorCoversPlatformFee,
    };
  }
  async quote(slug: string, body: DonationInput) {
    const campaign = await this.prisma.campaign.findFirst({
      where: {
        slug,
        status: 'ACTIVE',
        OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
      },
    });
    if (!campaign) throw new NotFoundException();
    const fees = await this.breakdown(body, campaign.currency);
    return {
      ...this.serialize(fees),
      provider: this.provider!.name,
      minimumAmount: this.provider!.minimumCheckout[fees.currency].toString(),
    };
  }
  private statusToken(id: string) {
    return createHmac('sha256', this.config.get('JWT_SECRET'))
      .update(`donation-status:${id}`)
      .digest('hex');
  }
  private publicResult(donation: Donation) {
    return {
      id: donation.id,
      status: donation.status,
      checkoutState: donation.checkoutState,
      provider: donation.provider,
      ...this.serialize(donation),
      checkoutUrl:
        donation.status === 'PENDING' && donation.checkoutState === 'READY'
          ? donation.checkoutUrl
          : null,
      statusToken: this.statusToken(donation.id),
    };
  }
  async getStatus(id: string, token: string | undefined) {
    const expected = this.statusToken(id);
    if (
      !token ||
      !/^[a-f0-9]{64}$/.test(token) ||
      !timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(token, 'hex'))
    )
      throw new NotFoundException();
    const donation = await this.prisma.donation.findUnique({ where: { id } });
    if (!donation) throw new NotFoundException();
    return this.publicResult(donation);
  }
  private replay(
    donation: Donation & { campaign: { slug: string } },
    slug: string,
    body: DonationInput,
    email: string,
    user?: AuthUser,
  ) {
    if (
      donation.campaign.slug !== slug ||
      donation.amount !== BigInt(body.amount) ||
      donation.currency !== (body.currency ?? donation.currency) ||
      donation.donorCoversPlatformFee !== body.donorCoversPlatformFee ||
      donation.donorEmail !== email ||
      donation.donorUserId !== (user?.id ?? null) ||
      donation.updatesOptIn !== body.updatesOptIn ||
      donation.donorName !== (body.donorName ?? null) ||
      donation.donorMessage !== (body.donorMessage ?? null) ||
      donation.isAnonymous !== body.isAnonymous
    )
      throw new ConflictException(
        'Idempotency key was used with different input',
      );
    if (donation.status === 'SUCCEEDED') return this.publicResult(donation);
    if (donation.checkoutState === 'INITIALIZING')
      throw new ConflictException(
        'Checkout is being prepared; retry with the same key',
      );
    if (donation.checkoutState === 'UNCERTAIN')
      throw new ServiceUnavailableException({
        message: 'Checkout outcome is uncertain; do not create another payment',
        donationId: donation.id,
        statusToken: this.statusToken(donation.id),
      });
    if (donation.checkoutState === 'FAILED')
      throw new ServiceUnavailableException('Checkout could not be created');
    return this.publicResult(donation);
  }
  async checkout(
    slug: string,
    body: DonationInput,
    key: string | undefined,
    user?: AuthUser,
  ) {
    const parsedKey = idempotencyKeySchema.safeParse(key);
    if (!parsedKey.success)
      throw new BadRequestException('Idempotency-Key must be a random UUID v4');
    const email = user?.email ?? body.email;
    if (!email)
      throw new BadRequestException('Guest donations require an email');
    const hash = createHash('sha256').update(parsedKey.data).digest('hex');
    const findExisting = () =>
      this.prisma.donation.findUnique({
        where: { idempotencyKeyHash: hash },
        include: { campaign: { select: { slug: true } } },
      });
    const existing = await findExisting();
    if (existing) return this.replay(existing, slug, body, email, user);
    let donation: Donation;
    try {
      donation = await this.prisma.$transaction(async (tx) => {
        // Serialize against pause/end/edit without holding a transaction during provider I/O.
        const campaigns = await tx.$queryRaw<
          { id: string; currency: Currency }[]
        >`
          SELECT "id", "currency" FROM "Campaign" WHERE "slug" = ${slug}
          AND "status" = 'ACTIVE' AND ("endsAt" IS NULL OR "endsAt" > CURRENT_TIMESTAMP) FOR SHARE`;
        const campaign = campaigns[0];
        if (!campaign) throw new NotFoundException();
        const fees = await this.breakdown(body, campaign.currency);
        return tx.donation.create({
          data: {
            campaignId: campaign.id,
            donorUserId: user?.id,
            donorEmail: email,
            updatesOptIn: body.updatesOptIn,
            donorName: body.donorName ?? null,
            donorMessage: body.donorMessage ?? null,
            isAnonymous: body.isAnonymous,
            idempotencyKeyHash: hash,
            reference: `don_${randomUUID().replaceAll('-', '')}`,
            provider: this.provider!.name,
            ...fees,
          },
        });
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const prior = await findExisting();
      if (!prior) throw error;
      return this.replay(prior, slug, body, email, user);
    }
    try {
      const base = this.config.get('WEB_URL');
      const returnUrl = new URL(`/campaigns/${encodeURIComponent(slug)}`, base);
      // No status capability in redirect URLs or provider metadata.
      const checkout = await this.provider!.createCheckout({
        amount: donation.totalCharged,
        currency: donation.currency as Currency,
        email,
        reference: donation.reference,
        successUrl: returnUrl.toString(),
        cancelUrl: returnUrl.toString(),
        metadata: { donationId: donation.id },
      });
      if (checkout.reference !== donation.reference)
        throw new PaymentProviderError('invalid-response');
      donation = await this.prisma.donation.update({
        where: { id: donation.id },
        data: {
          providerCheckoutId: checkout.id,
          checkoutUrl: checkout.url,
          checkoutState: 'READY',
        },
      });
      return this.publicResult(donation);
    } catch (error) {
      const definite =
        error instanceof PaymentProviderError && !error.uncertain;
      await this.prisma.donation.updateMany({
        where: {
          id: donation.id,
          status: 'PENDING',
          checkoutState: 'INITIALIZING',
        },
        data: {
          checkoutState: definite ? 'FAILED' : 'UNCERTAIN',
          ...(definite ? { status: 'FAILED' as const } : {}),
        },
      });
      throw new ServiceUnavailableException({
        message: definite
          ? 'Checkout could not be created'
          : 'Checkout outcome is uncertain; do not create another payment',
        donationId: donation.id,
        statusToken: this.statusToken(donation.id),
      });
    }
  }
}
