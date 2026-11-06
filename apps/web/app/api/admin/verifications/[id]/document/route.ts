import type { NextRequest } from 'next/server';
import { apiOrigin } from '../../../../../_lib/campaign-server';
import { ACCESS_COOKIE } from '../../../../../_lib/session';

const PRIVATE = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'",
  'Referrer-Policy': 'no-referrer',
};
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * An ID photo for the reviewing administrator. The API decrypts it and checks
 * the admin role; this passes the bytes through without caching them.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!token) return new Response(null, { status: 401, headers: PRIVATE });
  const { id } = await params;
  try {
    const response = await fetch(
      `${apiOrigin()}/admin/kyc/${encodeURIComponent(id)}/document`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(20000),
      },
    );
    const type = response.headers.get('content-type') ?? '';
    if (!response.ok || !TYPES.includes(type))
      return new Response(null, {
        status: response.ok ? 502 : response.status,
        headers: PRIVATE,
      });
    return new Response(response.body, {
      status: 200,
      headers: { ...PRIVATE, 'Content-Type': type },
    });
  } catch {
    return new Response(null, { status: 503, headers: PRIVATE });
  }
}
