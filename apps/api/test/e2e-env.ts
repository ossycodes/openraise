// The e2e tests get their own Postgres database, derived from DATABASE_URL,
// so they never share state with the dev server.

/** `…/openraise?schema=public` → `…/openraise_e2e?schema=public` */
export function e2eDatabaseUrl(databaseUrl: string): string {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set (copy .env.example to apps/api/.env)');
  }
  const url = new URL(databaseUrl);
  url.pathname = `${url.pathname.replace(/\/$/, '')}_e2e`;
  return url.toString();
}
