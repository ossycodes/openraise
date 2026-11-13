import { FeesService } from '../src/fees/fees.service.js';
import { createTestApp, type TestApp } from './helpers.js';

describe('fees', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('GET /config/fees publishes every fee, BigInts as strings', async () => {
    await t.http().get('/config/fees').expect(200, {
      currency: 'NGN',
      platformFeeBps: 350,
      donorFeeBps: 150,
      donorFlatFee: '10000',
      donorFlatFeeThreshold: '250000',
      withdrawalFee: '5000',
    });
  });

  it('FeesService computes with the deployment config', async () => {
    const fees = t.app.get(FeesService);
    expect((await fees.donation(5_000_000n)).netToCampaign).toBe(4_825_000n);
    expect((await fees.withdrawal(2_000_000n)).netPaidOut).toBe(1_995_000n);
  });
});
