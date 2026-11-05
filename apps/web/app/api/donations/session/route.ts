import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { apiOrigin } from '../../../_lib/campaign-server';
import {
  privateJson,
  sameOrigin,
  SESSION_COOKIE,
} from '../../../_lib/payment-proxy';
export async function GET() {
  try {
    const value = (await cookies()).get(SESSION_COOKIE)?.value;
    if (!value) return privateJson({ message: 'No donation in progress' }, 404);
    const { id, token, slug } = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    );
    if (
      typeof id !== 'string' ||
      typeof token !== 'string' ||
      typeof slug !== 'string'
    )
      throw new Error('Invalid session');
    const response = await fetch(
      `${apiOrigin()}/donations/${encodeURIComponent(id)}`,
      {
        headers: { 'X-Donation-Token': token },
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      },
    );
    const { statusToken: _token, ...data } = await response.json();
    return privateJson({ ...data, campaignSlug: slug }, response.status);
  } catch {
    return privateJson(
      { message: 'Unable to check this payment. Try again.' },
      503,
    );
  }
}
export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request))
    return privateJson({ message: 'Use this campaign page to continue.' }, 403);
  const result = privateJson({ cleared: true });
  result.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return result;
}
