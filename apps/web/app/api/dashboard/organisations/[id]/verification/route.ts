import { rateLimitHeaders } from '../../../../../_lib/rate-limit-relay';
import type { NextRequest } from 'next/server';
import { apiOrigin } from '../../../../../_lib/campaign-server';
import { privateJson, sameOrigin } from '../../../../../_lib/payment-proxy';
import { ACCESS_COOKIE } from '../../../../../_lib/session';

const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;
const text = (form: FormData, name: string) => {
  const v = form.get(name);
  return typeof v === 'string' ? v : '';
};
const fileError = (message: string, status = 400, upstream?: Response) =>
  privateJson({ errors: [{ path: 'file', message }] }, status, upstream);

/**
 * Sends an organisation's registration details and certificate photo for
 * review. Like identity checks, the photo goes from this server to the API,
 * which encrypts it; the stored key never reaches the browser.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!sameOrigin(request))
    return privateJson({ message: 'Send this from this site.' }, 403);
  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!token) return privateJson({ message: 'Sign in to continue.' }, 401);
  const auth = { Authorization: `Bearer ${token}` };
  const id = encodeURIComponent((await params).id);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return privateJson({ message: 'Check the details and try again.' }, 400);
  }
  const value = form.get('file');
  const file = value instanceof File && value.size > 0 ? value : null;
  if (!file) return fileError('Attach a photo of the certificate.');
  if (!TYPES.includes(file.type)) return fileError('Use a JPEG, PNG or WebP photo.');
  if (file.size > MAX_BYTES) return fileError('Photos can be up to 5 MB.');

  try {
    const uploadPath = `/organisations/${id}/verification/document`;
    const upload = await fetch(`${apiOrigin()}${uploadPath}`, {
      method: 'POST',
      headers: {
        ...auth,
        'Content-Type': file.type,
        ...(await rateLimitHeaders('POST', uploadPath, request.headers)),
      },
      body: Buffer.from(await file.arrayBuffer()),
      cache: 'no-store',
      signal: AbortSignal.timeout(60000),
    });
    const stored = await upload.json().catch(() => ({}));
    if (upload.status === 400 || upload.status === 413)
      return fileError(
        stored.message ?? 'Upload a clear photo of the certificate.',
        upload.status,
        upload,
      );
    if (!upload.ok)
      return privateJson(
        { message: stored.message ?? 'The upload failed. Try again.' },
        upload.status,
        upload,
      );

    const submitPath = `/organisations/${id}/verification`;
    const response = await fetch(`${apiOrigin()}${submitPath}`, {
      method: 'POST',
      headers: {
        ...auth,
        'Content-Type': 'application/json',
        ...(await rateLimitHeaders('POST', submitPath, request.headers)),
      },
      body: JSON.stringify({
        registrationType: text(form, 'registrationType'),
        registrationNumber: text(form, 'registrationNumber'),
        registeredName: text(form, 'registeredName'),
        documentKey: stored.documentKey,
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    const result = await response.json().catch(() => ({}));
    return privateJson(
      response.ok ? { status: result.status } : result,
      response.status,
      response,
    );
  } catch {
    return privateJson(
      { message: 'That didn’t go through. Reload to check before trying again.' },
      503,
    );
  }
}
