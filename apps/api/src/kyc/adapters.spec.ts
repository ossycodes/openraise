import { createHmac } from 'node:crypto';
import { DojahKycProvider } from './adapters/dojah.js';
import { QoreIdKycProvider } from './adapters/qoreid.js';
import { SmileKycProvider } from './adapters/smile.js';
import { KycProviderError, type IdentitySubmission } from './kyc-provider.js';
import { decideFromAuthority, normalizeDob } from './match.js';

const selfie = {
  bytes: new Uint8Array([0xff, 0xd8, 0xff, 0x01]),
  contentType: 'image/jpeg',
};
const nin: IdentitySubmission = {
  userId: 'user_1',
  documentType: 'NIN_SLIP',
  idNumber: '70123456789',
  legalName: 'Adaeze Obi',
  dateOfBirth: '1990-04-02',
  email: 'ada@example.com',
  consent: true,
  selfie,
};
const selfieBase64 = Buffer.from(selfie.bytes).toString('base64');

function transport(
  ...responses: (unknown | { status: number; body: unknown })[]
) {
  return vi.fn<typeof fetch>().mockImplementation(async () => {
    const next = responses.shift();
    if (!next) throw new Error('Unexpected extra request');
    if (typeof next === 'object' && 'body' in next) {
      const wrapped = next as { status: number; body: unknown };
      return new Response(JSON.stringify(wrapped.body), {
        status: wrapped.status,
      });
    }
    return new Response(JSON.stringify(next), { status: 200 });
  });
}
function requestBody(mock: ReturnType<typeof transport>, call = 0) {
  return JSON.parse(mock.mock.calls[call]?.[1]?.body as string);
}
function requestUrl(mock: ReturnType<typeof transport>, call = 0) {
  return String(mock.mock.calls[call]?.[0]);
}

describe('Dojah adapter', () => {
  const entity = {
    entity: {
      first_name: 'ADAEZE',
      last_name: 'OBI',
      date_of_birth: '1990-04-02',
      selfie_verification: { match: true, confidence_value: 99.1 },
    },
  };
  it('verifies a NIN when the record and selfie match', async () => {
    const fetcher = transport(entity);
    const provider = new DojahKycProvider(
      'app_1',
      'secret_1',
      'https://sandbox.dojah.io',
      fetcher,
    );
    await expect(provider.check(nin)).resolves.toEqual({
      status: 'VERIFIED',
      reference: null,
      verifiedName: 'ADAEZE OBI',
    });
    expect(requestUrl(fetcher)).toBe(
      'https://sandbox.dojah.io/api/v1/kyc/nin/verify',
    );
    expect(requestBody(fetcher)).toEqual({
      nin: nin.idNumber,
      selfie_image: selfieBase64,
    });
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: 'secret_1',
      AppId: 'app_1',
    });
  });
  it('never verifies when selfie evidence or authority date of birth is missing', async () => {
    for (const patch of [
      { selfie_verification: null },
      { date_of_birth: null },
    ]) {
      const p = new DojahKycProvider(
        'a',
        's',
        'https://sandbox.dojah.io',
        transport({ entity: { ...entity.entity, ...patch } }),
      );
      await expect(p.check(nin)).rejects.toMatchObject({
        code: 'invalid-response',
      });
    }
  });
  it('uses the BVN endpoint for a BVN', async () => {
    const fetcher = transport(entity);
    const provider = new DojahKycProvider(
      'app_1',
      'secret_1',
      'https://api.dojah.io',
      fetcher,
    );
    await provider.check({ ...nin, documentType: 'BVN' });
    expect(requestUrl(fetcher)).toBe(
      'https://api.dojah.io/api/v1/kyc/bvn/verify',
    );
    expect(requestBody(fetcher).bvn).toBe(nin.idNumber);
  });
  it('rejects a failed selfie match and a wrong name', async () => {
    const badSelfie = transport({
      entity: {
        ...entity.entity,
        selfie_verification: { match: false, confidence_value: 12 },
      },
    });
    const p1 = new DojahKycProvider(
      'a',
      's',
      'https://sandbox.dojah.io',
      badSelfie,
    );
    await expect(p1.check(nin)).resolves.toMatchObject({ status: 'REJECTED' });
    const badName = transport({
      entity: { ...entity.entity, first_name: 'CHIDI', last_name: 'EZE' },
    });
    const p2 = new DojahKycProvider(
      'a',
      's',
      'https://sandbox.dojah.io',
      badName,
    );
    await expect(p2.check(nin)).resolves.toMatchObject({ status: 'REJECTED' });
  });
  it('treats 404 as not found but 424 as unavailable, never a decision', async () => {
    const p404 = new DojahKycProvider(
      'a',
      's',
      'https://sandbox.dojah.io',
      transport({ status: 404, body: {} }),
    );
    await expect(p404.check(nin)).resolves.toMatchObject({
      status: 'REJECTED',
    });
    const p424 = new DojahKycProvider(
      'a',
      's',
      'https://sandbox.dojah.io',
      transport({ status: 424, body: {} }),
    );
    await expect(p424.check(nin)).rejects.toBeInstanceOf(KycProviderError);
  });
  it('refuses document types it cannot check', async () => {
    const provider = new DojahKycProvider(
      'a',
      's',
      'https://sandbox.dojah.io',
      transport(),
    );
    await expect(
      provider.check({ ...nin, documentType: 'PASSPORT' }),
    ).rejects.toMatchObject({ code: 'unsupported' });
  });
});

describe('QoreID adapter', () => {
  const verified = {
    id: 130,
    status: { state: 'complete', status: 'verified' },
    summary: {
      nin_check: {
        status: 'EXACT_MATCH',
        fieldMatches: { firstname: true, lastname: true },
      },
    },
    nin: {
      firstname: 'Adaeze',
      middlename: 'Chioma',
      lastname: 'Obi',
      birthdate: '02-04-1990',
    },
  };
  it('verifies on EXACT_MATCH plus a verified face match', async () => {
    const fetcher = transport(
      { accessToken: 'tok_1', expiresIn: 3600 },
      verified,
      { status: { status: 'verified' } },
    );
    const provider = new QoreIdKycProvider(
      'client_1',
      'secret_1',
      'https://api.qoreid.com',
      fetcher,
    );
    await expect(provider.check(nin)).resolves.toEqual({
      status: 'VERIFIED',
      reference: '130',
      verifiedName: 'Adaeze Chioma Obi',
    });
    expect(requestUrl(fetcher, 1)).toBe(
      'https://api.qoreid.com/v1/ng/identities/nin/70123456789',
    );
    expect(requestBody(fetcher, 1)).toEqual({
      firstname: 'Adaeze',
      lastname: 'Obi',
      dob: '1990-04-02',
    });
    expect(fetcher.mock.calls[1]?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer tok_1',
    });
    expect(requestBody(fetcher, 2)).toMatchObject({
      idNumber: nin.idNumber,
      photoBase64: selfieBase64,
    });
  });
  it('rejects without EXACT_MATCH and when the face does not verify', async () => {
    const noMatch = transport(
      { accessToken: 'tok_1', expiresIn: 3600 },
      { ...verified, summary: { nin_check: { status: 'NO_MATCH' } } },
    );
    const p1 = new QoreIdKycProvider(
      'c',
      's',
      'https://api.qoreid.com',
      noMatch,
    );
    await expect(p1.check(nin)).resolves.toMatchObject({ status: 'REJECTED' });
    const badFace = transport(
      { accessToken: 'tok_1', expiresIn: 3600 },
      verified,
      { status: { status: 'not_verified' } },
    );
    const p2 = new QoreIdKycProvider(
      'c',
      's',
      'https://api.qoreid.com',
      badFace,
    );
    await expect(p2.check(nin)).resolves.toMatchObject({ status: 'REJECTED' });
  });
  it('checks BVN authority fields and uses the BVN face endpoint', async () => {
    const fetcher = transport(
      { accessToken: 'tok_1', expiresIn: 3600 },
      {
        id: 'bvn_1',
        status: { status: 'verified' },
        summary: { bvn_check: { status: 'EXACT_MATCH' } },
        bvn: {
          firstName: 'Adaeze',
          lastName: 'Obi',
          dateOfBirth: '1990-04-02',
        },
      },
      { status: { status: 'verified' } },
    );
    const p = new QoreIdKycProvider(
      'c',
      's',
      'https://api.qoreid.com',
      fetcher,
    );
    await expect(
      p.check({ ...nin, documentType: 'BVN' }),
    ).resolves.toMatchObject({
      status: 'VERIFIED',
      verifiedName: 'Adaeze Obi',
    });
    expect(requestUrl(fetcher, 1)).toContain('/identities/bvn/');
    expect(requestUrl(fetcher, 2).endsWith('/face-verification/bvn')).toBe(
      true,
    );
  });
  it('treats a missing face result as unavailable rather than a verification', async () => {
    const fetcher = transport({ accessToken: 'tok_1' }, verified, {});
    const p = new QoreIdKycProvider(
      'c',
      's',
      'https://api.qoreid.com',
      fetcher,
    );
    await expect(p.check(nin)).rejects.toMatchObject({
      code: 'invalid-response',
    });
  });
  it('surfaces upstream failures as unavailable', async () => {
    const failing = transport({ status: 500, body: {} });
    const provider = new QoreIdKycProvider(
      'c',
      's',
      'https://api.qoreid.com',
      failing,
    );
    await expect(provider.check(nin)).rejects.toBeInstanceOf(KycProviderError);
  });
});

describe('Smile ID adapter', () => {
  const partnerId = '1234';
  const apiKey = 'smile_test_key';
  const reference = 'or-reserved-check';
  const callback = 'https://example.com/webhooks/kyc/smile';
  const privacy = 'https://example.com/privacy';
  const result = {
    product: 'enhanced_kyc',
    status: 'clear',
    partner_params: {
      customer_ref_id: reference,
      job_id: 'job_vendor',
      user_id: 'user_1',
    },
    id_fields: {
      first_name: 'Adaeze',
      last_name: 'Obi',
      date_of_birth: '1990-04-02',
    },
  };
  const timestamp = '2026-11-11T00:00:00.000Z';
  const signature = createHmac('sha256', apiKey)
    .update(`${timestamp}${partnerId}sid_request`)
    .digest('base64');
  const headers = {
    'Response-Signature': signature,
    'Response-Timestamp': timestamp,
  };
  const token = createHmac('sha256', apiKey)
    .update(`openraise-smile-callback-v1:${reference}`)
    .digest('hex');
  const provider = () =>
    new SmileKycProvider(
      partnerId,
      apiKey,
      'https://testapi.smileidentity.com',
      callback,
      undefined,
      privacy,
    );

  it('uses multipart token and consent, preserves our custom reference, and authenticates the callback URL', async () => {
    const fetcher = transport(
      { token: 'jwt_1' },
      { status: 'Accepted', job_id: 'job_vendor' },
    );
    const p = new SmileKycProvider(
      partnerId,
      apiKey,
      'https://testapi.smileidentity.com',
      callback,
      fetcher,
      privacy,
    );
    await expect(p.check({ ...nin, reference })).resolves.toEqual({
      status: 'PENDING',
      reference,
    });
    expect(requestUrl(fetcher, 0)).toBe(
      'https://testapi.smileidentity.com/v3/token',
    );
    expect(fetcher.mock.calls[0]?.[1]?.body).toBeInstanceOf(FormData);
    expect((fetcher.mock.calls[0]![1]!.body as FormData).get('user_id')).toBe(
      nin.userId,
    );
    const form = fetcher.mock.calls[1]?.[1]?.body as FormData;
    expect(form.get('id_type')).toBe('NIN_V2');
    expect(JSON.parse(String(form.get('partner_params')))).toEqual({
      customer_ref_id: reference,
    });
    expect(
      new URL(String(form.get('callback_url'))).searchParams.get('token'),
    ).toBe(token);
    expect(JSON.parse(String(form.get('consent')))).toMatchObject({
      granted: true,
      notice_language: 'EN',
      notice_privacy_policy_url: privacy,
    });
    expect(fetcher.mock.calls[1]?.[1]?.headers).toMatchObject({
      'SmileID-Token': 'jwt_1',
    });
  });
  it('requires the signature and the secret for this exact submission', () => {
    const p = provider();
    expect(p.verifyResult(headers, result, token)).toBe(true);
    expect(
      p.verifyResult(
        { ...headers, 'Response-Signature': 'bogus' },
        result,
        token,
      ),
    ).toBe(false);
    expect(p.verifyResult({}, result, token)).toBe(false);
    expect(p.verifyResult(headers, result)).toBe(false);
    expect(
      p.verifyResult(
        headers,
        { ...result, partner_params: { customer_ref_id: 'another-person' } },
        token,
      ),
    ).toBe(false);
    expect(
      p.verifyResult(
        { ...headers, 'response-signature': signature },
        result,
        token,
      ),
    ).toBe(false);
  });
  it('parses only complete matching authority results and preserves pending outcomes', () => {
    const p = provider();
    expect(p.parseResult(result)).toEqual({
      reference,
      check: {
        status: 'VERIFIED',
        reference,
        verifiedName: 'Adaeze Obi',
        verifiedDateOfBirth: '1990-04-02',
      },
    });
    for (const status of ['attention', 'error'])
      expect(p.parseResult({ ...result, status })?.check.status).toBe(
        'PENDING',
      );
    expect(p.parseResult({ ...result, status: 'block' })?.check.status).toBe(
      'REJECTED',
    );
    expect(p.parseResult({ ...result, status: 'mystery' })).toBeNull();
    expect(() =>
      p.parseResult({
        ...result,
        id_fields: { first_name: 'Adaeze', last_name: 'Obi' },
      }),
    ).toThrow(KycProviderError);
    expect(() =>
      p.parseResult({ ...result, product: 'another_product' }),
    ).toThrow(KycProviderError);
  });
  it('does not submit without consent and does not trust a malformed acknowledgement', async () => {
    await expect(
      provider().check({ ...nin, consent: false }),
    ).rejects.toMatchObject({ code: 'invalid-input' });
    const p = new SmileKycProvider(
      partnerId,
      apiKey,
      'https://testapi.smileidentity.com',
      callback,
      transport({ token: 'jwt' }, { status: 'clear' }),
      privacy,
    );
    await expect(p.check(nin)).rejects.toMatchObject({
      code: 'invalid-response',
    });
  });
});

describe('authority matching', () => {
  it('normalises vendor dates and rejects a wrong date of birth', () => {
    expect(normalizeDob('02-04-1990')).toBe('1990-04-02');
    expect(normalizeDob('1990-04-02T00:00:00Z')).toBe('1990-04-02');
    expect(normalizeDob('April 1990')).toBeNull();
    expect(normalizeDob('15-Apr-1985')).toBe('1985-04-15');
    expect(normalizeDob('2026-02-30')).toBeNull();
    expect(normalizeDob('1990-04-02garbage')).toBeNull();
    expect(
      decideFromAuthority(
        { legalName: 'Adaeze Obi', dateOfBirth: '1990-04-02' },
        { name: 'ADAEZE OBI', dateOfBirth: '1991-01-01' },
        null,
      ).status,
    ).toBe('REJECTED');
  });
});
