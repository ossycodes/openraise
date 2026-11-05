'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useActionState, useRef, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { updatePhotos, type FormState } from '../actions';
import { MAX_IMAGE_BYTES, MAX_IMAGES } from '../_lib/types';

/** Upload, reorder (pick the cover) and remove campaign photos. */
export function PhotoManager({
  campaignId,
  images,
  editable,
}: {
  campaignId: string;
  images: { id: string; url: string }[];
  editable: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [state, action, pending] = useActionState<FormState, FormData>(updatePhotos, {});
  const order = images.map((i) => i.id).join(',');

  async function upload(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setUploadError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
      return setUploadError('Use a JPEG, PNG or WebP photo.');
    if (file.size > MAX_IMAGE_BYTES) return setUploadError('Photos can be up to 5 MB.');
    setUploading(true);
    try {
      const body = new FormData();
      body.set('file', file);
      const response = await fetch(
        `/api/dashboard/campaigns/${encodeURIComponent(campaignId)}/images`,
        { method: 'POST', body },
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message ?? 'The upload failed. Try again.');
      }
      router.refresh();
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'The upload failed. Try again.');
    } finally {
      setUploading(false);
      if (input.current) input.current.value = '';
    }
  }

  const message = uploadError || state.message;
  return (
    <div className="photo-manager">
      {images.length > 0 ? (
        <ul className="photo-grid">
          {images.map((image, i) => (
            <li key={image.id}>
              <div className="photo-frame">
                <Image src={image.url} alt={`Photo ${i + 1}`} fill sizes="200px" />
                {i === 0 && <span className="cover-badge">Cover</span>}
              </div>
              {editable && (
                <form action={action} className="photo-controls">
                  <input type="hidden" name="id" value={campaignId} />
                  <input type="hidden" name="imageId" value={image.id} />
                  <input type="hidden" name="order" value={order} />
                  {i > 0 && (
                    <button
                      type="submit"
                      name="op"
                      value="cover"
                      className="text-button"
                      disabled={pending}
                    >
                      Make cover
                    </button>
                  )}
                  <button
                    type="submit"
                    name="op"
                    value="remove"
                    className="text-button"
                    disabled={pending}
                    aria-label={`Remove photo ${i + 1}`}
                  >
                    Remove
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="field-hint">
          No photos yet. The first photo is the cover people see on cards and
          when your link is shared.
        </p>
      )}
      {editable && images.length < MAX_IMAGES && (
        <label className={`photo-upload${uploading ? ' busy' : ''}`}>
          <ImagePlus size={20} aria-hidden="true" />
          {uploading ? 'Uploading…' : 'Add a photo'}
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={uploading}
            onChange={(e) => upload(e.target.files)}
          />
          <small>JPEG, PNG or WebP, up to 5 MB. {MAX_IMAGES - images.length} left.</small>
        </label>
      )}
      {message && (
        <p className="field-error" role="alert">
          {message}
        </p>
      )}
    </div>
  );
}
