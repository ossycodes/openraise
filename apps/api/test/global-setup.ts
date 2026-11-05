import 'dotenv/config';
import { execSync } from 'node:child_process';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { e2eDatabaseUrl } from './e2e-env.js';

/**
 * Runs once before the e2e suite: creates the separate e2e database if it
 * doesn't exist yet and applies every migration to it.
 */
export default async function setup() {
  const devUrl = process.env.DATABASE_URL;
  if (!devUrl) throw new Error('DATABASE_URL is not set');
  // vitest's `env` has already pointed DATABASE_URL at the e2e database;
  // connect to the original one to create it.
  const baseUrl = devUrl.includes('_e2e') ? devUrl.replace('_e2e', '') : devUrl;
  const testUrl = e2eDatabaseUrl(baseUrl);
  const name = new URL(testUrl).pathname.slice(1);

  const admin = new PrismaClient({
    adapter: new PrismaPg({ connectionString: baseUrl }),
  });
  try {
    const rows = await admin.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = ${name}) AS "exists"`;
    if (!rows[0]?.exists) {
      // Identifiers can't be bound as parameters; the name comes from config.
      await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    }
  } finally {
    await admin.$disconnect();
  }

  execSync('pnpm exec prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'pipe',
  });
}
