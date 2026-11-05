import 'server-only';
import { cookies } from 'next/headers';

/**
 * The signed-in session lives in one httpOnly cookie: the API's refresh token
 * plus the name and email to show in the header. Browser code never sees the
 * token; route handlers in app/api/auth use it to talk to the API.
 */
export const AUTH_COOKIE = 'openraise_session';
/** Matches the API's default REFRESH_TOKEN_TTL_DAYS */
export const AUTH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

export interface Viewer {
  name: string;
  email: string;
}

interface StoredSession extends Viewer {
  refreshToken: string;
}

export function encodeSession(session: StoredSession): string {
  return Buffer.from(JSON.stringify(session)).toString('base64url');
}

export function decodeSession(value: string | undefined): StoredSession | null {
  if (!value) return null;
  try {
    const s = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    return typeof s?.refreshToken === 'string' &&
      typeof s.name === 'string' &&
      typeof s.email === 'string'
      ? { refreshToken: s.refreshToken, name: s.name, email: s.email }
      : null;
  } catch {
    return null;
  }
}

export const authCookieOptions = (maxAge = AUTH_COOKIE_MAX_AGE) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge,
});

/** Who's signed in, for rendering. Null when signed out. */
export async function getViewer(): Promise<Viewer | null> {
  const session = decodeSession((await cookies()).get(AUTH_COOKIE)?.value);
  return session ? { name: session.name, email: session.email } : null;
}

/** Only same-site paths, so ?next= can't send people to another site. */
export function safeNext(value: string | null | undefined): string {
  return value && /^\/(?![/\\])/.test(value) ? value : '/';
}
