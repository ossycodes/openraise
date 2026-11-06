import { rateLimitHeaders } from '../../../../_lib/rate-limit-relay';
import type { NextRequest } from 'next/server';
import { apiOrigin } from '../../../../_lib/campaign-server';
import { sameOrigin, privateJson } from '../../../../_lib/payment-proxy';
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!sameOrigin(request))
    return privateJson({ message: 'Report from this site.' }, 403);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return privateJson({ message: 'Use a valid report.' }, 400);
  }
  const { slug } = await params;
  try {
    const response = await fetch(
      `${apiOrigin()}/campaigns/${encodeURIComponent(slug)}/reports`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(await rateLimitHeaders(
            'POST',
            `/campaigns/${encodeURIComponent(slug)}/reports`,
            request.headers,
          )),
          'Idempotency-Key': request.headers.get('idempotency-key') ?? '',
        },
        body: JSON.stringify(body),
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
      },
    );
    return privateJson(await response.json(), response.status, response);
  } catch {
    return privateJson(
      { message: 'Receipt could not be confirmed. Retry this same report.' },
      503,
    );
  }
}
