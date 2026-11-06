import type { NextRequest } from 'next/server';
import { apiOrigin } from '../../../_lib/campaign-server';
import { privateJson, sameOrigin } from '../../../_lib/payment-proxy';
export async function POST(request: NextRequest) {
  if (!sameOrigin(request))
    return privateJson({ message: 'Confirm from this site.' }, 403);
  try {
    const data = await request.json();
    if (
      typeof data.subscriptionId !== 'string' ||
      !/^[a-f0-9]{64}$/.test(data.token ?? '')
    )
      return privateJson(
        { message: 'Open the unsubscribe link from your email again.' },
        400,
      );
    const response = await fetch(
      `${apiOrigin()}/campaign-update-subscriptions/${encodeURIComponent(data.subscriptionId)}/unsubscribe`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: data.token }),
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      },
    );
    return privateJson(await response.json(), response.status);
  } catch {
    return privateJson(
      { message: 'Unable to unsubscribe. Try again shortly.' },
      503,
    );
  }
}
