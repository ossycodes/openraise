import 'server-only';
import { cookies } from 'next/headers';

/**
 * The signed-in session lives in two httpOnly cookies. Browser code never
 * sees either token.
 *
 * - `openraise_session`: the API's refresh token plus the name and email to
 *   show in the header. Lives as long as the refresh token.
 * - `openraise_access`: the short-lived access token the server sends to the
 *   API. It expires a minute before the token does; proxy.ts then refreshes
 *   both before the page renders.
 */
export const AUTH_COOKIE = 'openraise_session';
export const ACCESS_COOKIE = 'openraise_access';
/** Matches the API's default REFRESH_TOKEN_TTL_DAYS */
export const AUTH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

/** What the API's sign-in and refresh endpoints return. */
export interface AuthResult {
  user: { name: string; email: string };
  accessToken: string;
  /** Seconds until the access token expires */
  expiresIn: number;
  refreshToken: string;
}

/** A response's cookies, or anything else with a compatible set() */
type CookieJar = {
  set(name: string, value: string, options: ReturnType<typeof authCookieOptions>): unknown;
};

/** Stores a fresh sign-in or refresh on a response (and, in proxy.ts, the request). */
export function setSessionCookies(jar: CookieJar, auth: AuthResult) {
  jar.set(
    AUTH_COOKIE,
    encodeSession({
      refreshToken: auth.refreshToken,
      name: auth.user.name,
      email: auth.user.email,
    }),
    authCookieOptions(),
  );
  jar.set(
    ACCESS_COOKIE,
    auth.accessToken,
    authCookieOptions(Math.max(auth.expiresIn - 60, 30)),
  );
}

export function clearSessionCookies(jar: CookieJar) {
  jar.set(AUTH_COOKIE, '', authCookieOptions(0));
  jar.set(ACCESS_COOKIE, '', authCookieOptions(0));
}

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
