import { NextResponse, type NextRequest } from 'next/server';
import { apiOrigin } from './campaign-server';
export const SESSION_COOKIE = 'openraise_donation';
export const privateJson = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
export function sameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  return (
    request.headers.get('sec-fetch-site') !== 'cross-site' &&
    (!origin || origin === new URL(request.url).origin)
  );
}
export async function proxyPayment(
  request: NextRequest,
  slug: string,
  action: string,
) {
  if (!sameOrigin(request))
    return privateJson({ message: 'Use this campaign page to continue.' }, 403);
  if (!['quote', 'checkout'].includes(action))
    return privateJson({ message: 'Not found' }, 404);
  try {
    const body = await request.json();
    const response = await fetch(
      `${apiOrigin()}/campaigns/${encodeURIComponent(slug)}/donations/${action}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(request.headers.get('idempotency-key')
            ? { 'Idempotency-Key': request.headers.get('idempotency-key')! }
            : {}),
        },
        body: JSON.stringify(body),
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
      },
    );
    const data = await response.json();
    const { statusToken, ...publicData } = data;
    const result = privateJson(publicData, response.status);
    const id = data.id ?? data.donationId;
    if (
      action === 'checkout' &&
      typeof id === 'string' &&
      typeof statusToken === 'string'
    ) {
      result.cookies.set(
        SESSION_COOKIE,
        Buffer.from(JSON.stringify({ id, token: statusToken, slug })).toString(
          'base64url',
        ),
        {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 86400,
        },
      );
    }
    return result;
  } catch {
    return privateJson(
      {
        message:
          action === 'checkout'
            ? 'The checkout response could not be confirmed. Retry the same saved request.'
            : 'Unable to load the fee breakdown. Try again.',
      },
      503,
    );
  }
}
