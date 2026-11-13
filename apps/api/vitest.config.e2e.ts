import 'dotenv/config';
import { defineConfig } from 'vitest/config';
import { e2eDatabaseUrl } from './test/e2e-env.js';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e.spec.ts'],
    // Isolated from the dev database (see test/e2e-env.ts). These win over
    // .env because @nestjs/config never overrides process.env.
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: e2eDatabaseUrl(process.env.DATABASE_URL ?? ''),
      // Tests sign their own Google-shaped tokens; never use a real client ID.
      GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com',
      // Tests that need payments inject a fake provider; never real keys.
      PAYMENT_PROVIDER: 'disabled',
      // Vendor flows override the provider explicitly; never call real KYC accounts.
      KYC_PROVIDER: 'manual',
    },
    globalSetup: './test/global-setup.ts',
    fileParallelism: false,
  },
});
