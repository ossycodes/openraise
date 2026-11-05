import { NextResponse, type NextRequest } from 'next/server';
import { clearSessionCookies, safeNext } from '../../../_lib/session';

/**
 * Where pages send people whose tokens the API no longer accepts (signed out
 * elsewhere, password reset). Pages can't clear cookies while rendering, so
 * this does, then asks them to sign in again.
 */
export function GET(request: NextRequest) {
  const next = safeNext(request.nextUrl.searchParams.get('next'));
  const result = NextResponse.redirect(
    new URL(`/signin?next=${encodeURIComponent(next)}`, request.url),
  );
  result.headers.set('Cache-Control', 'no-store');
  clearSessionCookies(result.cookies);
  return result;
}
