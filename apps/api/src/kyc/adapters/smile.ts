import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import {
  KycProviderError,
  type IdentityCheck,
  type IdentityResultEvent,
  type IdentitySubmission,
  type KycProvider,
  type WebhookHeaders,
} from '../kyc-provider.js';
import { joinName, normalizeDob } from '../match.js';
import { ensureOk, read, VendorHttp } from '../vendor-http.js';

const tokenResponse = z.object({
  token: z.string().min(1).nullish(),
  jwt: z.string().min(1).nullish(),
  access_token: z.string().min(1).nullish(),
});
const resultBody = z.object({
  status: z.string(),
  product: z.literal('enhanced_kyc'),
  message: z.string().nullish(),
  reason: z.string().nullish(),
  job_id: z.string().nullish(),
  partner_params: z
    .object({
      customer_ref_id: z.string().min(1),
      job_id: z.string().nullish(),
      user_id: z.string().nullish(),
    })
    .nullish(),
  id_fields: z
    .object({
      first_name: z.string().nullish(),
      firstname: z.string().nullish(),
      given_names: z.string().nullish(),
      middle_name: z.string().nullish(),
      last_name: z.string().nullish(),
      surname: z.string().nullish(),
      date_of_birth: z.string().nullish(),
      dob: z.string().nullish(),
      birthdate: z.string().nullish(),
    })
    .nullish(),
});

function header(headers: WebhookHeaders, name: string): string | undefined {
  const matches = Object.entries(headers).filter(
    ([key]) => key.toLowerCase() === name,
  );
  if (matches.length !== 1 || typeof matches[0]?.[1] !== 'string')
    return undefined;
  return matches[0][1];
}

/**
 * Smile ID Enhanced KYC (docs.usesmileid.com): asynchronous. Submitting
 * queues a job against the NIN/BVN authority and returns PENDING with our
 * partner job id; the result arrives on the webhook, signed with the API
 * key. Selfie match is a different Smile product, so this adapter does
 * not ask for one. `attention`/`error` results stay PENDING for an admin.
 */
export class SmileKycProvider implements KycProvider {
  readonly name = 'smile' as const;
  readonly needsDocument = false;
  readonly needsSelfie = false;
  private readonly http: VendorHttp;

  constructor(
    private readonly partnerId: string,
    private readonly apiKey: string,
    baseUrl: string,
    private readonly callbackUrl?: string,
    transport: typeof fetch = fetch,
    readonly privacyPolicyUrl?: string,
  ) {
    this.http = new VendorHttp(baseUrl, transport);
  }

  private async token(userId: string): Promise<string> {
    const { status, value } = await this.http.form(
      '/v3/token',
      { user_id: userId, product: 'enhanced_kyc' },
      {
        'SmileID-API-Key': this.apiKey,
        'SmileID-Partner-ID': this.partnerId,
      },
    );
    ensureOk(status);
    const parsed = read(tokenResponse, value);
    const token = parsed.token ?? parsed.jwt ?? parsed.access_token;
    if (!token) throw new KycProviderError('invalid-response', status);
    return token;
  }

  async check(input: IdentitySubmission): Promise<IdentityCheck> {
    const idType =
      input.documentType === 'NIN_SLIP'
        ? 'NIN_V2'
        : input.documentType === 'BVN'
          ? 'BVN'
          : null;
    if (!idType) throw new KycProviderError('unsupported');
    if (!/^\d{11}$/.test(input.idNumber))
      throw new KycProviderError('invalid-input');
    if (!input.email || !input.consent)
      throw new KycProviderError('invalid-input');
    if (!this.callbackUrl || !this.privacyPolicyUrl)
      throw new KycProviderError('invalid-input');
    const jobId = input.reference ?? `or-${randomUUID()}`;
    const names = input.legalName.trim().replace(/\s+/g, ' ').split(' ');
    const callback = new URL(this.callbackUrl);
    callback.searchParams.set('token', this.callbackToken(jobId));
    const { status, value } = await this.http.form(
      '/v3/enhanced_kyc',
      {
        country: 'NG',
        id_type: idType,
        id_number: input.idNumber,
        user_id: input.userId,
        user_details: JSON.stringify({
          given_names: names.slice(0, -1).join(' ') || names[0],
          last_name: names[names.length - 1],
          email: input.email,
        }),
        consent: JSON.stringify({
          granted: true,
          granted_at: new Date().toISOString(),
          notice_language: 'EN',
          notice_privacy_policy_url: this.privacyPolicyUrl,
        }),
        // Smile overwrites job_id; our correlation id must use a custom key.
        partner_params: JSON.stringify({ customer_ref_id: jobId }),
        callback_url: callback.toString(),
      },
      { 'SmileID-Token': await this.token(input.userId) },
    );
    ensureOk(status);
    read(
      z.object({
        status: z.string().refine((v) => v.toLowerCase() === 'accepted'),
        job_id: z.string().min(1),
      }),
      value,
    );
    return { status: 'PENDING', reference: jobId };
  }

  private callbackToken(reference: string): string {
    return createHmac('sha256', this.apiKey)
      .update(`openraise-smile-callback-v1:${reference}`)
      .digest('hex');
  }

  verifyResult(
    headers: WebhookHeaders,
    body: unknown,
    token?: string,
  ): boolean {
    // Smile's signature covers timestamp + partner, not the result body.
    // A separate per-submission callback secret prevents a captured signature
    // being reused to decide someone else's check. Never log callback URLs.
    const parsed = resultBody.safeParse(body);
    const reference = parsed.success
      ? parsed.data.partner_params?.customer_ref_id
      : undefined;
    if (!reference || !token) return false;
    const expectedToken = Buffer.from(this.callbackToken(reference));
    const suppliedToken = Buffer.from(token);
    if (
      expectedToken.length !== suppliedToken.length ||
      !timingSafeEqual(expectedToken, suppliedToken)
    )
      return false;
    const signature = header(headers, 'response-signature');
    const timestamp = header(headers, 'response-timestamp');
    if (!signature || !timestamp) return false;
    const expected = createHmac('sha256', this.apiKey)
      .update(`${timestamp}${this.partnerId}sid_request`)
      .digest('base64');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  parseResult(body: unknown): IdentityResultEvent | null {
    const parsed = resultBody.safeParse(body);
    if (!parsed.success) throw new KycProviderError('invalid-response');
    const data = parsed.data;
    const reference = data.partner_params?.customer_ref_id;
    if (!reference) return null;
    const outcome = data.status.toLowerCase();
    if (outcome === 'clear') {
      const fields = data.id_fields;
      const verifiedName = joinName(
        fields?.first_name ?? fields?.firstname ?? fields?.given_names,
        fields?.middle_name,
        fields?.last_name ?? fields?.surname,
      );
      if (!verifiedName) throw new KycProviderError('invalid-response');
      // The service re-checks this name and the authority date of birth
      // against the submitted details before anything is verified.
      const dob = normalizeDob(
        fields?.date_of_birth ?? fields?.dob ?? fields?.birthdate ?? undefined,
      );
      if (!dob) throw new KycProviderError('invalid-response');
      return {
        reference,
        check: {
          status: 'VERIFIED',
          reference,
          verifiedName,
          ...(dob ? { verifiedDateOfBirth: dob } : {}),
        },
      };
    }
    if (outcome === 'block')
      return {
        reference,
        check: {
          status: 'REJECTED',
          reference,
          reason:
            'We could not confirm your identity from those details. Check them and try again.',
        },
      };
    // attention (needs a person to look) and error (not completed) leave
    // the check open; an administrator decides from the queue.
    if (outcome === 'attention' || outcome === 'error')
      return { reference, check: { status: 'PENDING', reference } };
    return null;
  }
}
