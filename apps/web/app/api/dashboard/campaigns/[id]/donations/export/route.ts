import type { NextRequest } from 'next/server';
import { apiOrigin } from '../../../../../../_lib/campaign-server';
import { privateJson } from '../../../../../../_lib/payment-proxy';
import { ACCESS_COOKIE } from '../../../../../../_lib/session';

/** Downloads a campaign's confirmed donations as CSV (owner only). */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!token) return privateJson({ message: 'Sign in to continue.' }, 401);
  const { id } = await context.params;
  try {
    const response = await fetch(
      `${apiOrigin()}/campaigns/${encodeURIComponent(id)}/donations/received.csv`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!response.ok)
      return privateJson({ message: 'That export isn’t available.' }, response.status);
    const day = new Date().toISOString().slice(0, 10);
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="donations-${day}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return privateJson({ message: 'The export failed. Try again.' }, 503);
  }
}
