import { randomUUID } from 'node:crypto';
import { RETENTION_ACTOR, KycRetentionService } from '../src/kyc/kyc-retention.js';
import { LedgerService } from '../src/ledger/ledger.service.js';
import { PaystackProvider } from '../src/payments/adapters/paystack.js';
import type { PayoutInput } from '../src/payments/payment-provider.js';
import { StorageService } from '../src/storage/storage.service.js';
import {
  createTestApp,
  signUpUser,
  type TestApp,
  type TestUser,
} from './helpers.js';

const provider = new PaystackProvider('identity-overrides-secret');
const payout = vi.fn(async (input: PayoutInput) => ({
  id: `TRF_${input.reference}`,
  reference: input.reference,
  status: 'pending' as const,
}));
provider.createPayout = payout;

const PHOTO = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
  Buffer.from('JFIF retention test document'),
]);
const DAY = 24 * 60 * 60 * 1000;

describe('payout name reviews', () => {
  let t: TestApp, admin: TestUser, otherAdmin: TestUser;
  const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.accessToken}` });

  beforeAll(async () => {
    t = await createTestApp({ paymentProvider: provider });
    admin = await signUpUser(t, { admin: true, verified: true });
    otherAdmin = await signUpUser(t, { admin: true, verified: true });
  });
  afterAll(async () => {
    await t.app.close();
  });

  /** A payout account straight in the database, past its 24-hour hold. */
  const account = (userId: string, accountName: string, accountNumber = '0123456789') =>
    t.prisma.bankAccount.create({
      data: {
        userId,
        bankCode: '058',
        bankName: 'Test Bank',
        accountNumber,
        accountName,
        provider: 'paystack',
        recipientId: `RCP_${randomUUID()}`,
        recipientUsable: true,
        nameMatchesProfile: false,
        payoutsAvailableAt: new Date(Date.now() - 1000),
      },
    });
  const list = (u: TestUser) => t.http().get('/bank-accounts').set(auth(u)).expect(200);
  const ask = (u: TestUser, id: string, explanation = 'This is my married name; my ID has my maiden name.') =>
    t.http().post(`/bank-accounts/${id}/name-review`).set(auth(u)).send({ explanation });
  const decide = (id: string, body: object, as = admin) =>
    t.http().post(`/admin/payout-names/${id}/decision`).set(auth(as)).send(body);

  it('shows each account against the verified name', async () => {
    const owner = await signUpUser(t, { verified: true });
    const same = await account(owner.id, 'USER TEST');
    const other = await account(owner.id, 'ADAEZE OKAFOR', '0987654321');
    const accounts = (await list(owner)).body as { id: string; nameCheck: string; nameReview: unknown }[];
    expect(accounts.find((a) => a.id === same.id)).toMatchObject({ nameCheck: 'MATCHES', nameReview: null });
    expect(accounts.find((a) => a.id === other.id)).toMatchObject({ nameCheck: 'MISMATCH', nameReview: null });

    const unverified = await signUpUser(t, { verified: true, identity: false });
    await account(unverified.id, 'TEST USER');
    expect((await list(unverified)).body[0].nameCheck).toBe('UNVERIFIED');
  });

  it('lets the owner ask once, only for a verified person and a mismatched account', async () => {
    const owner = await signUpUser(t, { verified: true });
    const stranger = await signUpUser(t, { verified: true });
    const matching = await account(owner.id, 'TEST USER');
    const different = await account(owner.id, 'ADAEZE OKAFOR', '0987654321');

    await t.http().post(`/bank-accounts/${different.id}/name-review`).send({ explanation: 'x'.repeat(20) }).expect(401);
    await ask(stranger, different.id).expect(404);
    await ask(owner, different.id, 'too short').expect(400);
    await ask(owner, matching.id).expect(409);

    const unverified = await signUpUser(t, { verified: true, identity: false });
    const theirs = await account(unverified.id, 'SOMEONE ELSE');
    const refused = await ask(unverified, theirs.id).expect(403);
    expect(refused.body.code).toBe('IDENTITY_UNVERIFIED');

    const first = await ask(owner, different.id).expect(201);
    expect(first.body).toMatchObject({ status: 'PENDING', reason: null });
    await ask(owner, different.id).expect(409);
    const shown = (await list(owner)).body.find((a: { id: string }) => a.id === different.id);
    expect(shown).toMatchObject({ nameCheck: 'MISMATCH', nameReview: { status: 'PENDING' } });

    const event = await t.prisma.auditEvent.findFirstOrThrow({
      where: { targetId: first.body.id, action: 'PAYOUT_NAME_REVIEW_REQUESTED' },
    });
    expect(event).toMatchObject({ actorId: owner.id, subjectId: owner.id });
    expect(event.after).toEqual({ status: 'PENDING', bankAccountId: different.id });
    expect(JSON.stringify(event)).not.toContain('married');
    expect(JSON.stringify(event)).not.toContain('ADAEZE');
  });

  it('is decided by another administrator, once, against the version they saw', async () => {
    const owner = await signUpUser(t, { verified: true });
    const different = await account(owner.id, 'ADAEZE OKAFOR');
    const asked = await ask(owner, different.id).expect(201);
    const id = asked.body.id as string;

    await t.http().get('/admin/payout-names').set(auth(owner)).expect(403);
    const queue = await t.http().get('/admin/payout-names').set(auth(admin)).expect(200);
    expect(queue.body.items.some((r: { id: string }) => r.id === id)).toBe(true);
    expect(queue.headers['cache-control']).toBe('no-store');
    const detail = await t.http().get(`/admin/payout-names/${id}`).set(auth(admin)).expect(200);
    expect(detail.body).toMatchObject({
      review: { status: 'PENDING', accountName: 'ADAEZE OKAFOR', verifiedName: 'Test User' },
      account: { maskedAccountNumber: '******6789', removed: false, withdrawals: 0 },
      currentVerifiedName: 'Test User',
    });
    expect(JSON.stringify(detail.body)).not.toContain('0123456789');
    const version = detail.body.review.updatedAt as string;

    await decide(id, { decision: 'DECLINE', expectedUpdatedAt: version }).expect(400);
    await decide(id, { decision: 'APPROVE', expectedUpdatedAt: new Date(0).toISOString() }).expect(409);
    // An administrator can't approve their own account.
    const adminsOwn = await account(admin.id, 'SOMEBODY ELSE');
    const own = await ask(admin, adminsOwn.id).expect(201);
    const ownVersion = (await t.http().get(`/admin/payout-names/${own.body.id}`).set(auth(otherAdmin))).body.review.updatedAt;
    await decide(own.body.id, { decision: 'APPROVE', expectedUpdatedAt: ownVersion }).expect(403);

    await decide(id, { decision: 'APPROVE', expectedUpdatedAt: version }).expect(200);
    await decide(id, { decision: 'DECLINE', reason: 'Too late', expectedUpdatedAt: version }).expect(409);
    expect(t.mail.lastTo(owner.email)?.subject).toBe('Your payout account was approved');
    const shown = (await list(owner)).body[0];
    expect(shown).toMatchObject({ nameCheck: 'APPROVED', nameReview: { status: 'APPROVED' } });

    const event = await t.prisma.auditEvent.findFirstOrThrow({
      where: { targetId: id, action: 'PAYOUT_NAME_REVIEWED' },
    });
    expect(event).toMatchObject({ actorId: admin.id, subjectId: owner.id });
    expect(event.before).toEqual({ status: 'PENDING' });

    // Bound to the name it was approved for.
    await t.prisma.identityVerification.updateMany({
      where: { userId: owner.id, status: 'VERIFIED' },
      data: { verifiedName: 'Musa Bello' },
    });
    expect((await list(owner)).body[0].nameCheck).toBe('MISMATCH');
  });

  it('tells the creator why when declined, and they can ask again', async () => {
    const owner = await signUpUser(t, { verified: true });
    const different = await account(owner.id, 'ADAEZE OKAFOR');
    const asked = await ask(owner, different.id).expect(201);
    const version = (await t.http().get(`/admin/payout-names/${asked.body.id}`).set(auth(admin))).body.review.updatedAt;
    await decide(asked.body.id, {
      decision: 'DECLINE',
      reason: 'Send a marriage certificate to support',
      expectedUpdatedAt: version,
    }).expect(200);
    expect(t.mail.lastTo(owner.email)?.text).toContain('Send a marriage certificate to support');
    expect((await list(owner)).body[0]).toMatchObject({
      nameCheck: 'MISMATCH',
      nameReview: { status: 'DECLINED', reason: 'Send a marriage certificate to support' },
    });
    await ask(owner, different.id).expect(201);
  });

  it('cancels a waiting review when the account is removed', async () => {
    const owner = await signUpUser(t, { verified: true });
    const different = await account(owner.id, 'ADAEZE OKAFOR');
    const asked = await ask(owner, different.id).expect(201);
    await t.http().delete(`/bank-accounts/${different.id}`).set(auth(owner)).expect(200);
    const row = await t.prisma.payoutNameReview.findUniqueOrThrow({ where: { id: asked.body.id } });
    expect(row.status).toBe('CANCELLED');
    await decide(asked.body.id, { decision: 'APPROVE', expectedUpdatedAt: row.updatedAt.toISOString() }).expect(409);
  });

  it('pays an approved account and still refuses one that is not', async () => {
    const owner = await signUpUser(t, { verified: true });
    const category = await t.prisma.category.findFirstOrThrow();
    const campaign = await t.prisma.campaign.create({
      data: {
        slug: `name-review-${randomUUID()}`,
        title: 'Name review campaign',
        ownerId: owner.id,
        categoryId: category.id,
        status: 'ACTIVE',
        currency: 'NGN',
        goalAmount: 100000000n,
      },
    });
    await t.app.get(LedgerService).post({
      kind: 'ADJUSTMENT',
      idempotencyKey: `fund:${campaign.id}`,
      currency: 'NGN',
      description: 'Test campaign funding',
      entries: [
        { account: { type: 'PROVIDER_CLEARING', currency: 'NGN' }, amount: 3000000n },
        { account: { type: 'CAMPAIGN_WALLET', currency: 'NGN', campaignId: campaign.id }, amount: -3000000n },
      ],
    });
    const approved = await account(owner.id, 'ADAEZE OKAFOR');
    const refused = await account(owner.id, 'CHINEDU EZE', '0987654321');
    const withdraw = (bankAccountId: string) =>
      t
        .http()
        .post(`/campaigns/${campaign.id}/withdrawals`)
        .set(auth(owner))
        .set('Idempotency-Key', randomUUID())
        .send({ amount: '1000000', bankAccountId, expectedFee: '5000' });

    const blocked = await withdraw(approved.id).expect(409);
    expect(blocked.body.code).toBe('ACCOUNT_NAME_MISMATCH');
    expect(payout).not.toHaveBeenCalled();

    const asked = await ask(owner, approved.id).expect(201);
    const version = (await t.http().get(`/admin/payout-names/${asked.body.id}`).set(auth(admin))).body.review.updatedAt;
    await decide(asked.body.id, { decision: 'APPROVE', expectedUpdatedAt: version }).expect(200);

    await withdraw(approved.id).expect(201);
    expect(payout).toHaveBeenCalledTimes(1);
    expect((await withdraw(refused.id).expect(409)).body.code).toBe('ACCOUNT_NAME_MISMATCH');
  });
});

describe('ID photo retention', () => {
  let t: TestApp, storage: StorageService, retention: KycRetentionService;
  const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.accessToken}` });

  beforeAll(async () => {
    t = await createTestApp();
    storage = t.app.get(StorageService);
    retention = t.app.get(KycRetentionService);
  });
  afterAll(async () => {
    await t.app.close();
  });

  async function stored(userId: string) {
    const key = `kyc/${userId}/${randomUUID()}.jpg.enc`;
    await storage.put(key, PHOTO, 'application/octet-stream');
    return key;
  }
  async function verification(userId: string, status: 'VERIFIED' | 'PENDING', decidedDaysAgo: number) {
    const documentKey = await stored(userId);
    return t.prisma.identityVerification.create({
      data: {
        userId,
        provider: 'manual',
        status,
        documentType: 'PASSPORT',
        idNumberLast4: '1234',
        legalName: 'Test User',
        dateOfBirth: new Date('1990-01-01T00:00:00Z'),
        verifiedName: status === 'VERIFIED' ? 'Test User' : null,
        documentKey,
        documentContentType: 'image/jpeg',
        decidedAt: status === 'VERIFIED' ? new Date(Date.now() - decidedDaysAgo * DAY) : null,
      },
    });
  }

  it('deletes a verified photo after the retention period and keeps the verification', async () => {
    const expired = await signUpUser(t, { verified: true, identity: false });
    const recent = await signUpUser(t, { verified: true, identity: false });
    const waiting = await signUpUser(t, { verified: true, identity: false });
    const old = await verification(expired.id, 'VERIFIED', 366);
    const fresh = await verification(recent.id, 'VERIFIED', 10);
    const pending = await verification(waiting.id, 'PENDING', 0);
    await t.prisma.identityVerification.update({
      where: { id: pending.id },
      data: { createdAt: new Date(Date.now() - 400 * DAY) },
    });

    await retention.sweep();

    const after = await t.prisma.identityVerification.findUniqueOrThrow({ where: { id: old.id } });
    expect(after).toMatchObject({ status: 'VERIFIED', verifiedName: 'Test User', documentKey: null, documentContentType: null });
    expect(after.documentDeletedAt).toBeInstanceOf(Date);
    expect(await storage.head(old.documentKey!)).toBeNull();
    for (const kept of [fresh, pending]) {
      const row = await t.prisma.identityVerification.findUniqueOrThrow({ where: { id: kept.id } });
      expect(row.documentKey).toBe(kept.documentKey);
      expect(await storage.head(kept.documentKey!)).not.toBeNull();
    }

    const event = await t.prisma.auditEvent.findFirstOrThrow({
      where: { targetId: old.id, action: 'IDENTITY_DOCUMENT_DELETED' },
    });
    expect(event).toMatchObject({ actorId: RETENTION_ACTOR, subjectId: expired.id });
    expect(event.before).toEqual({ document: true });
    expect(event.after).toEqual({ document: false });
    expect(JSON.stringify(event)).not.toContain(old.documentKey!);

    const admin = await signUpUser(t, { admin: true, verified: true });
    const detail = await t.http().get(`/admin/kyc/${old.id}`).set(auth(admin)).expect(200);
    expect(detail.body.verification).toMatchObject({ hasDocument: false });
    expect(detail.body.verification.documentDeletedAt).toBeTruthy();
  });

  it('deletes uploads nobody submitted within a day, and a submit can no longer use them', async () => {
    const u = await signUpUser(t, { verified: true, identity: false });
    const upload = async () =>
      (
        await t
          .http()
          .post('/kyc/document')
          .set(auth(u))
          .set('Content-Type', 'image/jpeg')
          .send(PHOTO)
          .expect(201)
      ).body.documentKey as string;
    const abandoned = await upload();
    const today = await upload();
    await t.prisma.identityDocumentUpload.update({
      where: { key: abandoned },
      data: { createdAt: new Date(Date.now() - 2 * DAY) },
    });
    // A file this database never recorded is never touched.
    const foreign = `kyc/${u.id}/${randomUUID()}.jpg.enc`;
    await storage.put(foreign, PHOTO, 'application/octet-stream');

    await retention.sweep();

    expect(await storage.head(abandoned)).toBeNull();
    expect(await storage.head(today)).not.toBeNull();
    expect(await storage.head(foreign)).not.toBeNull();
    await storage.deleteQuietly(foreign);

    const details = {
      documentType: 'PASSPORT',
      idNumber: 'A12345678',
      legalName: 'Ada Obi',
      dateOfBirth: '1990-01-01',
    };
    const late = await t.http().post('/kyc').set(auth(u)).send({ ...details, documentKey: abandoned }).expect(400);
    expect(late.body.errors[0].path).toBe('documentKey');
    await t.http().post('/kyc').set(auth(u)).send({ ...details, documentKey: today }).expect(201);
    // Submitted, so it's no longer an upload the sweep could take.
    expect(await t.prisma.identityDocumentUpload.count({ where: { key: today } })).toBe(0);
  });
});
