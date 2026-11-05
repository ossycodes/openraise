import { NextResponse, type NextRequest } from 'next/server';
import { apiOrigin } from './app/_lib/campaign-server';
import {
  ACCESS_COOKIE,
  AUTH_COOKIE,
  clearSessionCookies,
  decodeSession,
  setSessionCookies,
  type AuthResult,
} from './app/_lib/session';

/** Set for a few seconds after retrying a page, so a retry happens only once */
const RETRY_COOKIE = 'openraise_retry';

/**
 * Keeps signed-in pages signed in. Before a dashboard page or dashboard API
 * route runs, an expired access token is swapped for a new pair using the
 * refresh token, and the new cookies are handed to both the browser and this
 * render. Signed-out visitors go to /signin and come back afterwards.
 */
export async function proxy(request: NextRequest) {
  const isApi = request.nextUrl.pathname.startsWith('/api/');
  const session = decodeSession(request.cookies.get(AUTH_COOKIE)?.value);
  if (!session) return signedOut(request, isApi);
  if (request.cookies.has(ACCESS_COOKIE)) return NextResponse.next();

  let response: Response;
  try {
    response = await fetch(`${apiOrigin()}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    // API unreachable: let the page render its own "try again" state.
    return NextResponse.next();
  }
  const data = await response.json().catch(() => ({}));
  if (response.ok) {
    const auth = data as AuthResult;
    // The render reads cookies from the request, so update those too.
    setSessionCookies(
      { set: (name: string, value: string) => request.cookies.set(name, value) },
      auth,
    );
    const next = NextResponse.next({ request: { headers: request.headers } });
    setSessionCookies(next.cookies, auth);
    return next;
  }
  if (data?.code === 'REFRESH_RACE') {
    // Another request refreshed this session a moment ago; its response
    // carries the new cookies. API calls and form posts are told to retry.
    if (isApi || request.method !== 'GET')
      return NextResponse.json(
        { message: 'Your session was just refreshed. Try again.' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      );
    // A page retries once. If that collides too, it renders without a token
    // and goes via /signin, which sends signed-in people straight back.
    if (request.cookies.has(RETRY_COOKIE)) return NextResponse.next();
    const retry = NextResponse.redirect(request.nextUrl);
    retry.cookies.set(RETRY_COOKIE, '1', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 10,
    });
    return retry;
  }
  if (response.status === 401) return signedOut(request, isApi, true);
  return NextResponse.next();
}

function signedOut(request: NextRequest, isApi: boolean, clear = false) {
  const { pathname, search } = request.nextUrl;
  const result = isApi
    ? NextResponse.json(
        { message: 'Sign in to continue.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      )
    : NextResponse.redirect(
        new URL(`/signin?next=${encodeURIComponent(pathname + search)}`, request.url),
      );
  if (clear) clearSessionCookies(result.cookies);
  return result;
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/dashboard/:path*'],
};
