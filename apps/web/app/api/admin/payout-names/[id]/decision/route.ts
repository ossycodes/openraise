import type { NextRequest } from 'next/server';
import { apiOrigin } from '../../../../../_lib/campaign-server';
import { privateJson, sameOrigin } from '../../../../../_lib/payment-proxy';
import { ACCESS_COOKIE } from '../../../../../_lib/session';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!sameOrigin(request))
    return privateJson({ message: 'Decide from this site.' }, 403);
  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!token) return privateJson({ message: 'Sign in to continue.' }, 401);
  const { id } = await params;
  try {
    const response = await fetch(
      `${apiOrigin()}/admin/payout-names/${encodeURIComponent(id)}/decision`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(await request.json()),
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
      },
    );
    return privateJson(await response.json(), response.status);
  } catch {
    return privateJson(
      {
        message:
          'The decision could not be confirmed. Reload to check the latest status before retrying.',
      },
      503,
    );
  }
}
