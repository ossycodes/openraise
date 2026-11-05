'use client';
import { useRef, useState } from 'react';
import { Check, Copy, Share2, X } from 'lucide-react';
export function ShareButton({
  title,
  compact = false,
}: {
  title: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  async function share() {
    const link = `${window.location.origin}${window.location.pathname}`;
    setUrl(link);
    try {
      if (navigator.share) {
        await navigator.share({ title, url: link });
        return;
      }
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      dialog.current?.showModal();
    }
  }
  return (
    <>
      <button
        type="button"
        className={compact ? 'share-link' : 'secondary-button share-button'}
        onClick={share}
      >
        {copied ? (
          <Check size={17} aria-hidden="true" />
        ) : (
          <Share2 size={17} aria-hidden="true" />
        )}
        {copied
          ? 'Link copied'
          : compact
            ? 'Share campaign'
            : 'Share this campaign'}
      </button>
      <span className="sr-only" role="status">
        {copied ? 'Campaign link copied to clipboard.' : ''}
      </span>
      <dialog
        ref={dialog}
        className="small-dialog"
        aria-labelledby="share-title"
      >
        <button
          className="icon-button dialog-close"
          aria-label="Close share dialog"
          onClick={() => dialog.current?.close()}
        >
          <X />
        </button>
        <h2 id="share-title">Share a little possibility</h2>
        <p>Send this campaign to someone who might care.</p>
        <label htmlFor="campaign-link">Campaign link</label>
        <input
          id="campaign-link"
          readOnly
          value={url}
          onFocus={(event) => event.target.select()}
        />
        <button
          className="primary-button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
            } catch {
              document.getElementById('campaign-link')?.focus();
            }
          }}
        >
          <Copy size={16} aria-hidden="true" />
          {copied ? 'Link copied' : 'Copy campaign link'}
        </button>
      </dialog>
    </>
  );
}
