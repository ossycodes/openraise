import type { NextRequest } from 'next/server';
import { apiOrigin } from '../../../../_lib/campaign-server';
import { privateJson, sameOrigin } from '../../../../_lib/payment-proxy';
import { ACCESS_COOKIE } from '../../../../_lib/session';
import { rateLimitHeaders } from '../../../../_lib/rate-limit-relay';
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  if (!sameOrigin(request))
    return privateJson({ message: 'Make changes from this site.' }, 403);
  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!token) return privateJson({ message: 'Sign in to continue.' }, 401);
  const { path } = await params;
  // A fixed set of admin destinations; never forward arbitrary browser URLs.
  if (path.some((s) => !/^[a-zA-Z0-9_-]{1,100}$/.test(s)))
    return privateJson({ message: 'Unknown operation.' }, 404);
  const joined = path.join('/');
  let target: string,
    method = 'POST';
  if (
    /^(users|campaigns)\/[a-zA-Z0-9_-]+\/actions$/.test(joined) ||
    /^money\/reconciliation\/(WITHDRAWAL|DONATION|EVENT)\/[a-zA-Z0-9_-]+\/actions$/.test(
      joined,
    ) ||
    joined === 'settings'
  )
    target = `/admin/${joined}`;
  else if (joined === 'categories') target = '/categories';
  else if (/^categories\/[a-z0-9-]+$/.test(joined)) {
    target = `/${joined}`;
    method = 'PATCH';
  } else return privateJson({ message: 'Unknown operation.' }, 404);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return privateJson({ message: 'Send valid form details.' }, 400);
  }
  try {
    const response = await fetch(`${apiOrigin()}${target}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(await rateLimitHeaders(method, target, request.headers)),
      },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(60000),
    });
    return privateJson(await response.json(), response.status, response);
  } catch {
    return privateJson(
      {
        message:
          'The result could not be confirmed. Reload before trying again.',
      },
      503,
    );
  }
}
