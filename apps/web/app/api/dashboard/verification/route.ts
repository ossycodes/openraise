import { rateLimitHeaders } from '../../../_lib/rate-limit-relay';
import type { NextRequest } from 'next/server';
import { apiOrigin } from '../../../_lib/campaign-server';
import { privateJson, sameOrigin } from '../../../_lib/payment-proxy';
import { ACCESS_COOKIE } from '../../../_lib/session';

const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;
const text = (form: FormData, name: string) => {
  const v = form.get(name);
  return typeof v === 'string' ? v : '';
};
const fileError = (
  message: string,
  status = 400,
  upstream?: Response,
  path = 'file',
) => privateJson({ errors: [{ path, message }] }, status, upstream);
const photo = (form: FormData, name: string) => {
  const v = form.get(name);
  return v instanceof File && v.size > 0 ? v : null;
};

/**
 * Sends identity details for review. The photo goes to the API from this
 * server, which encrypts it before storing it; the person's tokens and the
 * stored document's key never reach the browser.
 */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request))
    return privateJson({ message: 'Send this from this site.' }, 403);
  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!token) return privateJson({ message: 'Sign in to continue.' }, 401);
  const auth = { Authorization: `Bearer ${token}` };

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return privateJson({ message: 'Check your details and try again.' }, 400);
  }
  const file = photo(form, 'file');
  const selfie = photo(form, 'selfie');
  for (const [candidate, path] of [
    [file, 'file'],
    [selfie, 'selfie'],
  ] as const) {
    if (candidate && !TYPES.includes(candidate.type))
      return fileError('Use a JPEG, PNG or WebP photo.', 400, undefined, path);
    if (candidate && candidate.size > MAX_BYTES)
      return fileError('Photos can be up to 5 MB.', 400, undefined, path);
  }

  try {
    const upload = async (candidate: File, path: string) => {
      const response = await fetch(`${apiOrigin()}/kyc/document`, {
        method: 'POST',
        headers: {
          ...auth,
          'Content-Type': candidate.type,
          ...(await rateLimitHeaders('POST', '/kyc/document', request.headers)),
        },
        body: Buffer.from(await candidate.arrayBuffer()),
        cache: 'no-store',
        signal: AbortSignal.timeout(60000),
      });
      const stored = await response.json().catch(() => ({}));
      if (response.status === 400 || response.status === 413)
        return {
          error: fileError(
            stored.message ?? 'Upload a clear photo.',
            response.status,
            response,
            path,
          ),
        };
      if (!response.ok)
        return {
          error: privateJson(
            { message: stored.message ?? 'The upload failed. Try again.' },
            response.status,
            response,
          ),
        };
      return { key: stored.documentKey as string };
    };
    let documentKey: string | undefined;
    if (file) {
      const uploaded = await upload(file, 'file');
      if (uploaded.error) return uploaded.error;
      documentKey = uploaded.key;
    }
    let selfieKey: string | undefined;
    if (selfie) {
      const uploaded = await upload(selfie, 'selfie');
      if (uploaded.error) return uploaded.error;
      selfieKey = uploaded.key;
    }

    const response = await fetch(`${apiOrigin()}/kyc`, {
      method: 'POST',
      headers: {
        ...auth,
        'Content-Type': 'application/json',
        ...(await rateLimitHeaders('POST', '/kyc', request.headers)),
      },
      body: JSON.stringify({
        documentType: text(form, 'documentType'),
        idNumber: text(form, 'idNumber'),
        legalName: text(form, 'legalName'),
        dateOfBirth: text(form, 'dateOfBirth'),
        consent: text(form, 'consent') === 'yes',
        ...(documentKey ? { documentKey } : {}),
        ...(selfieKey ? { selfieKey } : {}),
      }),
      cache: 'no-store',
      // A vendor check can take a few calls; the manual flow is instant.
      signal: AbortSignal.timeout(60000),
    });
    const result = await response.json().catch(() => ({}));
    // Only the outcome goes back; the stored document's key stays here.
    return privateJson(
      response.ok ? { status: result.status } : result,
      response.status,
      response,
    );
  } catch {
    return privateJson(
      {
        message: 'That didn’t go through. Reload to check before trying again.',
      },
      503,
    );
  }
}
