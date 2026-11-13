import { z } from 'zod';
import {
  KycProviderError,
  type IdentityCheck,
  type IdentitySubmission,
  type KycProvider,
} from '../kyc-provider.js';
import {
  decideFromAuthority,
  joinName,
  normalizeDob,
  splitName,
} from '../match.js';
import { ensureOk, isNotFound, read, VendorHttp } from '../vendor-http.js';

const tokenResponse = z.object({
  accessToken: z.string().min(1),
  expiresIn: z.number().positive().nullish(),
});
const identityResponse = z.object({
  id: z.union([z.number(), z.string()]).nullish(),
  status: z.object({ status: z.string() }).nullish(),
  summary: z.record(z.string(), z.unknown()).nullish(),
  nin: z
    .object({
      firstname: z.string().nullish(),
      middlename: z.string().nullish(),
      lastname: z.string().nullish(),
      birthdate: z.string().nullish(),
    })
    .nullish(),
  bvn: z
    .object({
      firstName: z.string().nullish(),
      middleName: z.string().nullish(),
      lastName: z.string().nullish(),
      dateOfBirth: z.string().nullish(),
    })
    .nullish(),
});

const NOT_FOUND = 'We could not find that ID. Check the number and try again.';
const SELFIE_FAILED =
  'Your selfie did not match the photo on that ID. Try again in good light.';

/**
 * QoreID (docs.qoreid.com): synchronous NIN/BVN verification, then a face
 * match of the selfie against the authority photo where supported. A
 * client-credentials token is cached until shortly before it expires.
 * Only an EXACT_MATCH with agreeing name/date verifies anyone.
 */
export class QoreIdKycProvider implements KycProvider {
  readonly name = 'qoreid' as const;
  readonly needsDocument = false;
  readonly needsSelfie = true;
  private readonly http: VendorHttp;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly clientId: string,
    private readonly secret: string,
    baseUrl: string,
    transport: typeof fetch = fetch,
  ) {
    this.http = new VendorHttp(baseUrl, transport);
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now())
      return this.token.value;
    const { status, value } = await this.http.json('/token', {
      body: { clientId: this.clientId, secret: this.secret },
    });
    ensureOk(status);
    const parsed = read(tokenResponse, value);
    this.token = {
      value: parsed.accessToken,
      expiresAt: Date.now() + ((parsed.expiresIn ?? 3600) - 30) * 1000,
    };
    return parsed.accessToken;
  }

  async check(input: IdentitySubmission): Promise<IdentityCheck> {
    if (input.documentType !== 'NIN_SLIP' && input.documentType !== 'BVN')
      throw new KycProviderError('unsupported');
    if (!/^\d{11}$/.test(input.idNumber))
      throw new KycProviderError('invalid-input');
    if (!input.selfie) throw new KycProviderError('invalid-input');
    const nin = input.documentType === 'NIN_SLIP';
    const { firstName, lastName } = splitName(input.legalName);
    const token = await this.accessToken();
    const auth = { Authorization: `Bearer ${token}` };

    const { status, value } = await this.http.json(
      nin
        ? `/v1/ng/identities/nin/${encodeURIComponent(input.idNumber)}`
        : `/v1/ng/identities/bvn/${encodeURIComponent(input.idNumber)}`,
      {
        headers: auth,
        body: {
          firstname: firstName,
          lastname: lastName,
          dob: input.dateOfBirth,
        },
      },
    );
    if (isNotFound(status))
      return { status: 'REJECTED', reference: null, reason: NOT_FOUND };
    ensureOk(status);
    const record = read(identityResponse, value);
    const reference = record.id != null ? String(record.id) : null;
    if (!['verified', 'not_verified'].includes(record.status?.status ?? ''))
      throw new KycProviderError('invalid-response');
    const summary = record.summary ?? {};
    const checkSummary = nin ? summary['nin_check'] : summary['bvn_check'];
    const exact =
      record.status?.status === 'verified' &&
      typeof checkSummary === 'object' &&
      checkSummary !== null &&
      (checkSummary as { status?: unknown }).status === 'EXACT_MATCH';
    if (!exact)
      return {
        status: 'REJECTED',
        reference,
        reason:
          'We could not confirm your identity from those details. Check them and try again.',
      };
    const authority = nin
      ? {
          name: joinName(
            record.nin?.firstname,
            record.nin?.middlename,
            record.nin?.lastname,
          ),
          dateOfBirth: normalizeDob(record.nin?.birthdate),
        }
      : {
          name: joinName(
            record.bvn?.firstName,
            record.bvn?.middleName,
            record.bvn?.lastName,
          ),
          dateOfBirth: normalizeDob(record.bvn?.dateOfBirth),
        };
    const decided = decideFromAuthority(input, authority, reference);
    if (decided.status !== 'VERIFIED') return decided;

    // Face match: the selfie must be the person on the authority record.
    const face = await this.http.json(
      nin
        ? '/v1/ng/identities/face-verification/nin'
        : '/v1/ng/identities/face-verification/bvn',
      {
        headers: auth,
        body: {
          idNumber: input.idNumber,
          photoBase64: Buffer.from(input.selfie.bytes).toString('base64'),
        },
      },
    );
    if (isNotFound(face.status))
      return { status: 'REJECTED', reference, reason: SELFIE_FAILED };
    ensureOk(face.status);
    const faceRecord = read(
      z.object({
        status: z.object({ status: z.enum(['verified', 'not_verified']) }),
      }),
      face.value,
    );
    if (faceRecord.status?.status !== 'verified')
      return { status: 'REJECTED', reference, reason: SELFIE_FAILED };
    return decided;
  }
}
