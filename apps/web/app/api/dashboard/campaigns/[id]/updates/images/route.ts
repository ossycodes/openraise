import type { NextRequest } from 'next/server';
import { apiOrigin } from '../../../../../../_lib/campaign-server';
import { privateJson, sameOrigin } from '../../../../../../_lib/payment-proxy';
import { ACCESS_COOKIE } from '../../../../../../_lib/session';

const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Stages a photo for an update. The file comes here and the server uploads it
 * to storage with the API's presigned URL, so storage needs no browser CORS
 * setup and the person's tokens never reach the browser.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!sameOrigin(request))
    return privateJson({ message: 'Upload from this site.' }, 403);
  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!token) return privateJson({ message: 'Sign in to continue.' }, 401);
  const { id } = await context.params;
  const campaign = `${apiOrigin()}/campaigns/${encodeURIComponent(id)}/updates/images`;
  const auth = { Authorization: `Bearer ${token}` };

  let file: File;
  try {
    const value = (await request.formData()).get('file');
    if (!(value instanceof File)) throw new Error();
    file = value;
  } catch {
    return privateJson({ message: 'Choose a photo to upload.' }, 400);
  }
  if (!TYPES.includes(file.type))
    return privateJson({ message: 'Use a JPEG, PNG or WebP photo.' }, 400);
  if (file.size > MAX_BYTES)
    return privateJson({ message: 'Photos can be up to 5 MB.' }, 400);

  try {
    const ticket = await fetch(`${campaign}/upload-url`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentType: file.type, size: file.size }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    const slot = await ticket.json();
    if (!ticket.ok)
      return privateJson(
        { message: slot.message ?? 'Upload refused.' },
        ticket.status,
      );

    const stored = await fetch(slot.uploadUrl, {
      method: slot.method ?? 'PUT',
      headers: slot.headers,
      body: Buffer.from(await file.arrayBuffer()),
      signal: AbortSignal.timeout(60000),
    });
    if (!stored.ok)
      return privateJson({ message: 'The upload failed. Try again.' }, 502);

    return privateJson({ key: slot.key }, 201);
  } catch {
    return privateJson({ message: 'The upload failed. Try again.' }, 503);
  }
}
