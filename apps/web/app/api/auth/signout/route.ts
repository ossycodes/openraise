import { NextResponse, type NextRequest } from 'next/server';
import { apiOrigin } from '../../../_lib/campaign-server';
import { privateJson, sameOrigin } from '../../../_lib/payment-proxy';
import {
  AUTH_COOKIE,
  clearSessionCookies,
  decodeSession,
} from '../../../_lib/session';

/** The header's sign-out form posts here; revokes the refresh token. */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request))
    return privateJson({ message: 'Sign out from this site.' }, 403);
  const session = decodeSession(request.cookies.get(AUTH_COOKIE)?.value);
  if (session) {
    // Best effort: the cookies are cleared even if the API is unreachable.
    await fetch(`${apiOrigin()}/auth/signout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    }).catch(() => undefined);
  }
  const result = NextResponse.redirect(new URL('/', request.url), 303);
  result.headers.set('Cache-Control', 'no-store');
  clearSessionCookies(result.cookies);
  return result;
}
