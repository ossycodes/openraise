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
const fileError = (message: string, status = 400, upstream?: Response) =>
  privateJson({ errors: [{ path: 'file', message }] }, status, upstream);

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
  const value = form.get('file');
  const file = value instanceof File && value.size > 0 ? value : null;
  if (file && !TYPES.includes(file.type))
    return fileError('Use a JPEG, PNG or WebP photo.');
  if (file && file.size > MAX_BYTES)
    return fileError('Photos can be up to 5 MB.');

  try {
    let documentKey: string | undefined;
    if (file) {
      const upload = await fetch(`${apiOrigin()}/kyc/document`, {
        method: 'POST',
        headers: {
          ...auth,
          'Content-Type': file.type,
          ...(await rateLimitHeaders('POST', '/kyc/document', request.headers)),
        },
        body: Buffer.from(await file.arrayBuffer()),
        cache: 'no-store',
        signal: AbortSignal.timeout(60000),
      });
      const stored = await upload.json().catch(() => ({}));
      if (upload.status === 400 || upload.status === 413)
        return fileError(
          stored.message ?? 'Upload a clear photo of your ID.',
          upload.status,
          upload,
        );
      if (!upload.ok)
        return privateJson(
          { message: stored.message ?? 'The upload failed. Try again.' },
          upload.status,
          upload,
        );
      documentKey = stored.documentKey;
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
        ...(documentKey ? { documentKey } : {}),
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
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
