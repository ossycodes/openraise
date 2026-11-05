import { createTestApp, type TestApp } from './helpers.js';

describe('GET /health', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('reports ok', async () => {
    await t.http().get('/health').expect(200, { status: 'ok' });
  });
});
