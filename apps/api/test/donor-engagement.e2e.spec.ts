import { randomUUID } from 'node:crypto';
import { PaystackProvider } from '../src/payments/adapters/paystack.js';
import { LedgerService } from '../src/ledger/ledger.service.js';
import { donationEntries } from '../src/ledger/ledger.entries.js';
import {
  createTestApp,
  signUpUser,
  type TestApp,
  type TestUser,
} from './helpers.js';
const provider = new PaystackProvider('test-secret');
provider.createCheckout = async (input) => ({
  id: input.reference,
  reference: input.reference,
  url: `https://checkout.paystack.com/${input.reference}`,
});
describe('donor messages and anonymous giving', () => {
  let t: TestApp, owner: TestUser, stranger: TestUser, admin: TestUser;
  let slug: string, campaignId: string;
  beforeAll(async () => {
    t = await createTestApp({ paymentProvider: provider });
    owner = await signUpUser(t, { verified: true });
    stranger = await signUpUser(t);
    admin = await signUpUser(t, { admin: true });
  });
  afterAll(async () => {
    await t.app.close();
  });
  beforeEach(async () => {
    const category = await t.prisma.category.findFirstOrThrow();
    const campaign = await t.prisma.campaign.create({
      data: {
        slug: `donors-${randomUUID()}`,
        title: 'A cause to support',
        ownerId: owner.id,
        categoryId: category.id,
        status: 'ACTIVE',
        currency: 'NGN',
        goalAmount: 100000000n,
      },
    });
    slug = campaign.slug;
    campaignId = campaign.id;
  });
  const input = (patch = {}) => ({
    amount: '500000',
    email: 'supporter@example.com',
    ...patch,
  });
  const checkout = (patch = {}, key: string = randomUUID()) =>
    t
      .http()
      .post(`/campaigns/${slug}/donations/checkout`)
      .set('Idempotency-Key', key)
      .send(input(patch));
  async function confirm(id: string) {
    const d = await t.prisma.donation.findUniqueOrThrow({ where: { id } });
    const posting = await t.app
      .get(LedgerService)
      .post({
        kind: 'DONATION',
        idempotencyKey: `donation:${id}`,
        currency: 'NGN',
        description: 'Confirmed test gift',
        entries: donationEntries(campaignId, 'NGN', d),
      });
    await t.prisma.donation.update({
      where: { id },
      data: {
        status: 'SUCCEEDED',
        succeededAt: new Date(),
        ledgerTransactionId: posting.transactionId,
      },
    });
  }
  it('keeps legacy and new donations anonymous by default, with no pending messages in public feeds', async () => {
    const r = await checkout({
      donorName: 'Private Supporter',
      donorMessage: 'You can do it!',
    }).expect(201);
    expect(
      (await t.prisma.donation.findUniqueOrThrow({ where: { id: r.body.id } }))
        .isAnonymous,
    ).toBe(true);
    let feed = await t.http().get(`/campaigns/${slug}/donations`).expect(200);
    expect(feed.body.items).toEqual([]);
    await confirm(r.body.id);
    feed = await t.http().get(`/campaigns/${slug}/donations`).expect(200);
    expect(feed.body.items[0]).toMatchObject({
      displayName: 'Anonymous',
      message: 'You can do it!',
    });
    expect(JSON.stringify(feed.body)).not.toMatch(
      /Private Supporter|supporter@example|donorEmail|donorUserId|donorName/,
    );
  });
  it('shows a chosen public name and plaintext message only after settlement', async () => {
    const r = await checkout({
      donorName: '  Ada Supporter  ',
      donorMessage: '  <script>alert(1)</script> Keep going.  ',
      isAnonymous: false,
    }).expect(201);
    await confirm(r.body.id);
    const feed = await t.http().get(`/campaigns/${slug}/donations`).expect(200);
    expect(feed.body.items[0]).toMatchObject({
      displayName: 'Ada Supporter',
      message: '<script>alert(1)</script> Keep going.',
    });
    const top = await t
      .http()
      .get(`/campaigns/${slug}/donations?sort=top`)
      .expect(200);
    expect(JSON.stringify(top.body)).not.toMatch(
      /Ada Supporter|Keep going|supporter@example/,
    );
  });
  it('locks name, message and anonymity to the original idempotent request', async () => {
    const key = randomUUID();
    const r = await checkout(
      { donorName: 'Ada', donorMessage: 'Support', isAnonymous: false },
      key,
    ).expect(201);
    expect(
      (
        await checkout(
          { donorName: 'Ada', donorMessage: 'Support', isAnonymous: false },
          key,
        ).expect(201)
      ).body.id,
    ).toBe(r.body.id);
    for (const patch of [
      { donorName: 'Other' },
      { donorMessage: 'Changed' },
      { isAnonymous: true },
    ])
      await checkout(
        {
          donorName: 'Ada',
          donorMessage: 'Support',
          isAnonymous: false,
          ...patch,
        },
        key,
      ).expect(409);
  });
  it('requires a display name when publishing it and validates optional fields', async () => {
    for (const patch of [
      { isAnonymous: false },
      { donorName: 'x'.repeat(101) },
      { donorMessage: 'x'.repeat(501) },
      { isAnonymous: 'yes' },
    ])
      await checkout(patch).expect(400);
    expect(await t.prisma.donation.count({ where: { campaignId } })).toBe(0);
  });
  it('lets the owner and admins see a supplied private name while denying other people', async () => {
    const r = await checkout({
      donorName: 'Private Name',
      donorMessage: 'Kind words',
    }).expect(201);
    await confirm(r.body.id);
    const ownerResult = await t
      .http()
      .get(`/campaigns/${campaignId}/donations/received`)
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(ownerResult.status).toBe(200);
    expect(ownerResult.body.items[0]).toMatchObject({
      donorName: 'Private Name',
      isAnonymous: true,
      donorMessage: 'Kind words',
    });
    await t
      .http()
      .get(`/campaigns/${campaignId}/donations/received`)
      .set('Authorization', `Bearer ${stranger.accessToken}`)
      .expect(404);
    await t.http().get(`/admin/donations/${r.body.id}`).expect(401);
    await t
      .http()
      .get(`/admin/donations/${r.body.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(403);
    const review = await t
      .http()
      .get(`/admin/donations/${r.body.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(review.body.donorName).toBe('Private Name');
    expect(review.body).not.toHaveProperty('donorEmail');
  });
});
