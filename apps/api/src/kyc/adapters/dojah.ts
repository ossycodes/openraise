import { z } from 'zod';
import {
  KycProviderError,
  type IdentityCheck,
  type IdentitySubmission,
  type KycProvider,
} from '../kyc-provider.js';
import { decideFromAuthority, joinName, normalizeDob } from '../match.js';
import { ensureOk, isNotFound, read, VendorHttp } from '../vendor-http.js';

const entity = z.object({
  entity: z.object({
    first_name: z.string().nullish(),
    firstname: z.string().nullish(),
    last_name: z.string().nullish(),
    surname: z.string().nullish(),
    middle_name: z.string().nullish(),
    middlename: z.string().nullish(),
    date_of_birth: z.string().nullish(),
    birthdate: z.string().nullish(),
    selfie_verification: z
      .object({ match: z.boolean(), confidence_value: z.number().nullish() })
      .nullish(),
  }),
});

const NOT_FOUND = 'We could not find that ID. Check the number and try again.';
const SELFIE_FAILED =
  'Your selfie did not match the photo on that ID. Try again in good light.';

/**
 * Dojah (docs.dojah.io): synchronous NIN/BVN lookups with an optional
 * selfie match in the same call. Auth is the raw secret key plus AppId;
 * a 404 is a definitive "no record", everything else non-2xx (402 wallet,
 * 424 upstream, 5xx) means the check did not happen.
 */
export class DojahKycProvider implements KycProvider {
  readonly name = 'dojah' as const;
  readonly needsDocument = false;
  readonly needsSelfie = true;
  private readonly http: VendorHttp;

  constructor(
    private readonly appId: string,
    private readonly secretKey: string,
    baseUrl: string,
    transport: typeof fetch = fetch,
  ) {
    this.http = new VendorHttp(baseUrl, transport);
  }

  private headers() {
    return { Authorization: this.secretKey, AppId: this.appId };
  }

  async check(input: IdentitySubmission): Promise<IdentityCheck> {
    if (input.documentType !== 'NIN_SLIP' && input.documentType !== 'BVN')
      throw new KycProviderError('unsupported');
    if (!/^\d{11}$/.test(input.idNumber))
      throw new KycProviderError('invalid-input');
    const nin = input.documentType === 'NIN_SLIP';
    if (!input.selfie) throw new KycProviderError('invalid-input');

    const selfie = Buffer.from(input.selfie.bytes).toString('base64');
    const { status, value } = await this.http.json(
      nin ? '/api/v1/kyc/nin/verify' : '/api/v1/kyc/bvn/verify',
      {
        headers: this.headers(),
        body: {
          ...(nin ? { nin: input.idNumber } : { bvn: input.idNumber }),
          selfie_image: selfie,
        },
      },
    );
    if (isNotFound(status))
      return { status: 'REJECTED', reference: null, reason: NOT_FOUND };
    ensureOk(status);
    const record = read(entity, value).entity;
    if (!record.selfie_verification)
      throw new KycProviderError('invalid-response');
    if (!record.selfie_verification.match)
      return { status: 'REJECTED', reference: null, reason: SELFIE_FAILED };
    return decideFromAuthority(
      input,
      {
        name: joinName(
          record.first_name ?? record.firstname,
          record.middle_name ?? record.middlename,
          record.last_name ?? record.surname,
        ),
        dateOfBirth: normalizeDob(
          record.date_of_birth ?? record.birthdate ?? undefined,
        ),
      },
      null,
    );
  }
}
