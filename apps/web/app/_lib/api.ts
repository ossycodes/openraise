import { rateLimitHeaders } from './rate-limit-relay';
import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { apiOrigin } from './campaign-server';
import { ACCESS_COOKIE } from './session';

/** A field-level validation error from the API's zod pipe. */
export interface FieldError {
  path: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public errors: FieldError[] = [],
  ) {
    super(message);
  }
}

/**
 * Calls the API as the signed-in person. proxy.ts has already refreshed the
 * access token for dashboard routes; a missing or rejected token sends the
 * person to sign in and back to `returnTo`.
 */
export async function apiAs<T>(
  path: string,
  init: {
    method?: string;
    body?: unknown;
    returnTo?: string;
    headers?: Record<string, string>;
  } = {},
): Promise<T> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  const next = encodeURIComponent(init.returnTo ?? '/dashboard');
  if (!token) redirect(`/signin?next=${next}`);
  const response = await fetch(`${apiOrigin()}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body === undefined
        ? {}
        : { 'Content-Type': 'application/json' }),
      ...init.headers,
      ...(await rateLimitHeaders(init.method ?? 'GET', path)),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  // The token was refused (signed out elsewhere, password reset): clear the
  // session cookies first, or /signin would bounce straight back here.
  if (response.status === 401) redirect(`/api/auth/expired?next=${next}`);
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof data?.message === 'string'
        ? data.message
        : 'Something went wrong. Try again.';
    throw new ApiError(
      response.status,
      message,
      Array.isArray(data?.errors) ? data.errors : [],
    );
  }
  return data as T;
}
