import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    // Unit tests only; DB-backed tests in test/ run with vitest.config.e2e.ts.
    include: ['src/**/*.spec.ts'],
  },
});
