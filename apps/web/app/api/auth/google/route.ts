import { rateLimitHeaders } from '../../../_lib/rate-limit-relay';
import type { NextRequest } from 'next/server';
import { apiOrigin } from '../../../_lib/campaign-server';
import { privateJson, sameOrigin } from '../../../_lib/payment-proxy';
import { setSessionCookies, type AuthResult } from '../../../_lib/session';

/** Exchanges a Google ID token for an OpenRaise session. */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request))
    return privateJson({ message: 'Sign in from this site.' }, 403);
  try {
    const { credential } = await request.json();
    if (typeof credential !== 'string')
      return privateJson({ message: 'Google sign-in failed. Try again.' }, 400);
    const response = await fetch(`${apiOrigin()}/auth/google`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(await rateLimitHeaders('POST', '/auth/google', request.headers)),
      },
      body: JSON.stringify({ credential }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    const data = await response.json();
    if (!response.ok) {
      const message =
        response.status === 429 || data?.code === 'RATE_LIMIT_UNAVAILABLE'
          ? data.message
          : response.status === 409
            ? 'That email is already linked to a different Google account.'
            : 'Google sign-in failed. Try again.';
      return privateJson({ message }, response.status, response);
    }
    const auth = data as AuthResult;
    const result = privateJson({
      user: { name: auth.user.name, email: auth.user.email },
    });
    setSessionCookies(result.cookies, auth);
    return result;
  } catch {
    return privateJson(
      { message: 'Sign-in is unavailable right now. Try again.' },
      503,
    );
  }
}
