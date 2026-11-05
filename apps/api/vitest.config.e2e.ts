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
    },
    globalSetup: './test/global-setup.ts',
    fileParallelism: false,
  },
});
