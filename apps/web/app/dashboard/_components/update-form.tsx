'use client';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ImagePlus, Send, X } from 'lucide-react';
interface Photo {
  key: string;
  name: string;
  preview: string;
}
export function UpdateForm({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [frozen, setFrozen] = useState(false);
  const [key, setKey] = useState('');
  const previews = useRef<string[]>([]);
  const attempt = useRef<{
    title: string;
    body: string;
    imageKeys: string[];
  } | null>(null);
  useEffect(() => {
    setKey(crypto.randomUUID());
    return () => previews.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);
  async function upload(file: File | undefined) {
    if (!file) return;
    if (photos.length >= 3) {
      setError('Choose up to three photos.');
      return;
    }
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      setError('Use JPEG, PNG or WebP photos up to 5 MB.');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const data = new FormData();
      data.set('file', file);
      const response = await fetch(
        `/api/dashboard/campaigns/${encodeURIComponent(campaignId)}/updates/images`,
        { method: 'POST', body: data },
      );
      if (response.redirected) {
        location.assign(
          `/signin?next=${encodeURIComponent(location.pathname)}`,
        );
        return;
      }
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? 'The upload failed.');
      const preview = URL.createObjectURL(file);
      previews.current.push(preview);
      setPhotos((old) => [
        ...old,
        { key: result.key, name: file.name, preview },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The upload failed.');
    } finally {
      setUploading(false);
    }
  }
  async function publish(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!key || busy || uploading) return;
    setError('');
    setSuccess('');
    setBusy(true);
    setFrozen(true);
    const payload = attempt.current ?? {
      title: title.trim(),
      body: body.trim(),
      imageKeys: photos.map((p) => p.key),
    };
    attempt.current = payload;
    try {
      const response = await fetch(
        `/api/dashboard/campaigns/${encodeURIComponent(campaignId)}/updates`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': key,
          },
          body: JSON.stringify(payload),
        },
      );
      if (response.redirected) {
        location.assign(
          `/signin?next=${encodeURIComponent(location.pathname)}`,
        );
        return;
      }
      const result = await response.json();
      if (!response.ok) {
        if (response.status < 500) {
          attempt.current = null;
          setFrozen(false);
          setKey(crypto.randomUUID());
        }
        throw new Error(
          typeof result.message === 'string'
            ? result.message
            : 'Check the title, text and photos.',
        );
      }
      if (typeof result.id !== 'string')
        throw new Error(
          'Publishing could not be confirmed. Retry this same request.',
        );
      setTitle('');
      setBody('');
      setPhotos([]);
      setFrozen(false);
      attempt.current = null;
      setKey(crypto.randomUUID());
      setSuccess('Update published. Opted-in supporters will be emailed.');
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Publishing could not be confirmed. Retry the same request.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="update-editor" onSubmit={(e) => void publish(e)}>
      <div className="section-eyebrow">Keep your community close</div>
      <h2>What’s the latest?</h2>
      <p>
        A small update can mean a lot. Share a milestone, a thank-you or how the
        funds are helping.
      </p>
      <fieldset disabled={busy || uploading || frozen}>
        <legend className="sr-only">Update content</legend>
        <label htmlFor="update-title">Update title</label>
        <input
          id="update-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          minLength={3}
          maxLength={120}
          required
          placeholder="A milestone worth sharing"
        />
        <label htmlFor="update-body">Your update</label>
        <textarea
          id="update-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={7}
          minLength={10}
          maxLength={5000}
          required
          placeholder="Tell your supporters what has happened since your last update."
        />
        <div className="update-upload-row">
          <label className="secondary-button">
            <ImagePlus size={17} aria-hidden="true" />
            Add a photo
            <input
              className="sr-only"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={photos.length >= 3}
              onChange={(e) => {
                void upload(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
          <small>Up to 3 photos · JPEG, PNG or WebP · 5 MB each</small>
        </div>
        <div className="update-photo-previews">
          {photos.map((photo) => (
            <div key={photo.key}>
              <Image
                src={photo.preview}
                unoptimized
                width={110}
                height={85}
                alt={photo.name}
              />
              <button
                className="icon-button"
                type="button"
                aria-label={`Remove ${photo.name}`}
                onClick={() =>
                  setPhotos((old) => old.filter((p) => p.key !== photo.key))
                }
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      </fieldset>
      <p className="privacy-note">
        Published updates are public and can’t be edited. You can remove an
        update later. Only supporters who opted in get an email.
      </p>
      {uploading && <p role="status">Uploading photo…</p>}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="dashboard-notice" role="status">
          {success}
        </p>
      )}
      <button
        className="primary-button"
        type="submit"
        disabled={busy || uploading || !key}
      >
        <Send size={16} aria-hidden="true" />
        {busy ? 'Publishing…' : frozen ? 'Retry publishing' : 'Publish update'}
      </button>
    </form>
  );
}
