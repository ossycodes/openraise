import { createHmac } from 'node:crypto';
import { SmileKycProvider } from '../src/kyc/adapters/smile.js';
import {
  KYC_PROVIDER,
  KycProviderError,
  type KycProvider,
} from '../src/kyc/kyc-provider.js';
import {
  createTestApp,
  signUpUser,
  type TestApp,
  type TestUser,
} from './helpers.js';

const details = {
  documentType: 'NIN_SLIP',
  idNumber: '70123456789',
  legalName: 'Adaeze Obi',
  dateOfBirth: '1990-04-02',
  consent: true,
};
const auth = (user: TestUser) => ({
  Authorization: `Bearer ${user.accessToken}`,
});
const PHOTO = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 1, 2, 3]);

describe('vendor identity submissions', () => {
  let t: TestApp;
  const check = vi.fn<KycProvider['check']>();
  const provider: KycProvider = {
    name: 'dojah',
    needsDocument: false,
    needsSelfie: true,
    check,
  };
  beforeAll(async () => {
    t = await createTestApp({
      overrides: [{ provide: KYC_PROVIDER, useValue: provider }],
    });
  });
  afterAll(async () => {
    await t.app.close();
  });
  beforeEach(() => {
    check.mockReset();
  });
  const creator = () => signUpUser(t, { verified: true, identity: false });
  async function upload(user: TestUser) {
    const result = await t
      .http()
      .post('/kyc/document')
      .set(auth(user))
      .set('Content-Type', 'image/jpeg')
      .send(PHOTO)
      .expect(201);
    return result.body.documentKey as string;
  }
  it('requires explicit consent before contacting a vendor', async () => {
    const user = await creator();
    const result = await t
      .http()
      .post('/kyc')
      .set(auth(user))
      .send({ ...details, consent: false })
      .expect(400);
    expect(result.body.errors[0].path).toBe('consent');
    expect(check).not.toHaveBeenCalled();
  });
  it('passes the decrypted selfie and full ID only to the provider, and audits the decision', async () => {
    const user = await creator();
    const selfieKey = await upload(user);
    check.mockResolvedValue({
      status: 'VERIFIED',
      reference: null,
      verifiedName: 'ADAEZE OBI',
    });
    const result = await t
      .http()
      .post('/kyc')
      .set(auth(user))
      .send({ ...details, selfieKey })
      .expect(201);
    expect(result.body).toMatchObject({
      status: 'VERIFIED',
      idNumberLast4: '6789',
      verifiedName: 'ADAEZE OBI',
    });
    expect(JSON.stringify(result.body)).not.toContain(details.idNumber);
    expect(check.mock.calls[0]?.[0]).toMatchObject({
      idNumber: details.idNumber,
      selfie: { bytes: PHOTO },
      consent: true,
    });
    const row = await t.prisma.identityVerification.findUniqueOrThrow({
      where: { id: result.body.id },
    });
    expect(row.documentKey).toBe(selfieKey);
    expect(
      await t.prisma.auditEvent.count({
        where: { targetId: row.id, action: 'IDENTITY_DECIDED' },
      }),
    ).toBe(1);
  });
  it('keeps ambiguous failures pending and prevents another paid check', async () => {
    const user = await creator();
    const selfieKey = await upload(user);
    check.mockRejectedValue(new KycProviderError('transport-error'));
    await t
      .http()
      .post('/kyc')
      .set(auth(user))
      .send({ ...details, selfieKey })
      .expect(503);
    await t
      .http()
      .post('/kyc')
      .set(auth(user))
      .send({ ...details, selfieKey })
      .expect(409);
    expect(check).toHaveBeenCalledTimes(1);
    const status = await t.http().get('/kyc').set(auth(user)).expect(200);
    expect(status.body).toMatchObject({
      status: 'PENDING',
      selfieRequired: true,
    });
  });
  it('reserves one check before dispatch even for concurrent requests', async () => {
    const user = await creator();
    const keys = await Promise.all([upload(user), upload(user)]);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    check.mockImplementation(async () => {
      entered();
      await gate;
      return {
        status: 'VERIFIED',
        reference: null,
        verifiedName: 'Adaeze Obi',
      };
    });
    const first = t
      .http()
      .post('/kyc')
      .set(auth(user))
      .send({ ...details, selfieKey: keys[0] })
      .then((r) => r);
    await started;
    try {
      await t
        .http()
        .post('/kyc')
        .set(auth(user))
        .send({ ...details, selfieKey: keys[1] })
        .expect(409);
    } finally {
      release();
    }
    expect((await first).status).toBe(201);
    expect(check).toHaveBeenCalledTimes(1);
  });
});

describe('Smile identity callbacks', () => {
  let t: TestApp;
  const apiKey = 'test-smile-api-key';
  const partnerId = '1234';
  let callbackBody: Record<string, unknown>;
  let callbackToken: string;
  let early = false;
  let dob = details.dateOfBirth;
  const timestamp = '2026-11-13T12:00:00.000Z';
  const headers = {
    'Response-Timestamp': timestamp,
    'Response-Signature': createHmac('sha256', apiKey)
      .update(`${timestamp}${partnerId}sid_request`)
      .digest('base64'),
  };
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    if (String(url).endsWith('/v3/token'))
      return new Response(JSON.stringify({ token: 'test-jwt' }));
    const form = init!.body as FormData;
    callbackBody = {
      product: 'enhanced_kyc',
      status: 'clear',
      partner_params: {
        ...JSON.parse(String(form.get('partner_params'))),
        job_id: 'job_vendor',
        user_id: form.get('user_id'),
      },
      id_fields: { first_name: 'Adaeze', last_name: 'Obi', date_of_birth: dob },
    };
    callbackToken = new URL(String(form.get('callback_url'))).searchParams.get(
      'token',
    )!;
    if (early)
      await t
        .http()
        .post('/webhooks/kyc/smile')
        .query({ token: callbackToken })
        .set(headers)
        .send(callbackBody)
        .expect(200);
    return new Response(
      JSON.stringify({ status: 'Accepted', job_id: 'job_vendor' }),
      { status: 202 },
    );
  });
  beforeAll(async () => {
    const provider = new SmileKycProvider(
      partnerId,
      apiKey,
      'https://testapi.smileidentity.com',
      'https://example.com/webhooks/kyc/smile',
      fetcher,
      'https://example.com/privacy',
    );
    t = await createTestApp({
      overrides: [{ provide: KYC_PROVIDER, useValue: provider }],
    });
  });
  afterAll(async () => {
    await t.app.close();
  });
  beforeEach(() => {
    early = false;
    dob = details.dateOfBirth;
  });
  async function submit() {
    const user = await signUpUser(t, { verified: true, identity: false });
    const response = await t
      .http()
      .post('/kyc')
      .set(auth(user))
      .send(details)
      .expect(201);
    return { user, response };
  }
  const callback = (token = callbackToken, body = callbackBody) =>
    t
      .http()
      .post('/webhooks/kyc/smile')
      .query({ token })
      .set(headers)
      .send(body);
  it('matches the custom reference, checks the callback secret, and applies one audited decision', async () => {
    const { response } = await submit();
    expect(response.body.status).toBe('PENDING');
    await callback('wrong-token').expect(401);
    const first = await callback().expect(200);
    expect(first.body.applied).toBe(true);
    expect((await callback().expect(200)).body.applied).toBe(false);
    expect(
      await t.prisma.auditEvent.count({
        where: { targetId: response.body.id, action: 'IDENTITY_DECIDED' },
      }),
    ).toBe(1);
  });
  it('does not lose a callback arriving before the submission acknowledgement', async () => {
    early = true;
    const { response } = await submit();
    expect(response.body.status).toBe('VERIFIED');
  });
  it('rejects a clear vendor result whose authority birth date does not match', async () => {
    dob = '1991-01-01';
    const { response } = await submit();
    await callback().expect(200);
    const row = await t.prisma.identityVerification.findUniqueOrThrow({
      where: { id: response.body.id },
    });
    expect(row.status).toBe('REJECTED');
  });
  it('does not let attention or error results close a check, and refuses missing authority evidence', async () => {
    const { user } = await submit();
    for (const status of ['attention', 'error'])
      await callback(callbackToken, { ...callbackBody, status }).expect(200);
    await callback(callbackToken, {
      ...callbackBody,
      id_fields: { first_name: 'Adaeze', last_name: 'Obi' },
    }).expect(400);
    expect(
      (await t.http().get('/kyc').set(auth(user)).expect(200)).body.status,
    ).toBe('PENDING');
  });
});
