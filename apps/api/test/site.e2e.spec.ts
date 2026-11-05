import { createTestApp, type TestApp } from './helpers.js';

describe('GET /config/site', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('publishes the deployment branding, OpenRaise by default', async () => {
    await t.http().get('/config/site').expect(200, {
      name: 'OpenRaise',
      logoUrl: null,
      primaryColor: null,
      supportEmail: null,
      // Set for every e2e run in vitest.config.e2e.ts
      googleClientId: 'test-client.apps.googleusercontent.com',
    });
  });
});
