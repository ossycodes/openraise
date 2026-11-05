import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { FeesService } from '../src/fees/fees.service.js';

describe('fees', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /config/fees publishes every fee, BigInts as strings', async () => {
    await request(app.getHttpServer()).get('/config/fees').expect(200, {
      currency: 'NGN',
      platformFeeBps: 350,
      donorFeeBps: 150,
      donorFlatFee: '10000',
      donorFlatFeeThreshold: '250000',
      withdrawalFee: '5000',
    });
  });

  it('FeesService computes with the deployment config', () => {
    const fees = app.get(FeesService);
    expect(fees.donation(5_000_000n).netToCampaign).toBe(4_825_000n);
    expect(fees.withdrawal(2_000_000n).netPaidOut).toBe(1_995_000n);
  });
});
