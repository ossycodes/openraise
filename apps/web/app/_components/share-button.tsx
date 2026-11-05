'use client';
import Image from 'next/image';
import { useId, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  MessageCircle,
  Share2,
  X,
} from 'lucide-react';
export function ShareButton({
  title,
  compact = false,
}: {
  title: string;
  compact?: boolean;
}) {
  const id = useId();
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState('');
  const [image, setImage] = useState('');
  const [message, setMessage] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const linkInput = useRef<HTMLInputElement>(null);
  function open() {
    const path = window.location.pathname;
    setUrl(`${window.location.origin}${path}`);
    setImage(`${path}/opengraph-image`);
    setMessage('');
    setCopied(false);
    dialog.current?.showModal();
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setMessage('Campaign link copied.');
    } catch {
      linkInput.current?.focus();
      linkInput.current?.select();
      setMessage('Select and copy the campaign link below.');
    }
  }
  const text = encodeURIComponent(
    `${title} — help this story reach its next supporter.`,
  );
  const encoded = encodeURIComponent(url);
  return (
    <>
      <button
        type="button"
        className={compact ? 'share-link' : 'secondary-button share-button'}
        onClick={open}
      >
        <Share2 size={17} aria-hidden="true" />
        {compact ? 'Share campaign' : 'Share this campaign'}
      </button>
      <dialog
        ref={dialog}
        className="campaign-share-dialog"
        aria-labelledby={`${id}-title`}
      >
        <button
          className="icon-button dialog-close"
          aria-label="Close share dialog"
          onClick={() => dialog.current?.close()}
        >
          <X />
        </button>
        <div className="section-eyebrow">One share can start something</div>
        <h2 id={`${id}-title`}>
          Help this story
          <br />
          <em>find its people.</em>
        </h2>
        <p>Your next message could make a difference.</p>
        {image && (
          <div className="share-card-preview">
            <Image
              src={image}
              alt={`Share card: ${title}`}
              width={1200}
              height={630}
              unoptimized
            />
          </div>
        )}
        <div
          className="social-share-actions"
          aria-label="Share campaign options"
        >
          <button type="button" onClick={() => void copy()}>
            <span>
              <Copy size={21} aria-hidden="true" />
            </span>
            {copied ? 'Copied' : 'Copy link'}
          </button>
          <a
            href={`https://wa.me/?text=${text}%20${encoded}`}
            target="_blank"
            rel="noreferrer"
            aria-label="Share on WhatsApp (opens a new tab)"
          >
            <span className="whatsapp-share">
              <MessageCircle size={23} aria-hidden="true" />
            </span>
            WhatsApp
          </a>
          <a
            href={`https://twitter.com/intent/tweet?text=${text}&url=${encoded}`}
            target="_blank"
            rel="noreferrer"
            aria-label="Share on X (opens a new tab)"
          >
            <span className="x-share" aria-hidden="true">
              𝕏
            </span>
            X
          </a>
          <a
            href={`https://www.facebook.com/sharer/sharer.php?u=${encoded}`}
            target="_blank"
            rel="noreferrer"
            aria-label="Share on Facebook (opens a new tab)"
          >
            <span className="facebook-share" aria-hidden="true">
              f
            </span>
            Facebook
          </a>
          <a
            href={`https://www.linkedin.com/sharing/share-offsite/?url=${encoded}`}
            target="_blank"
            rel="noreferrer"
            aria-label="Share on LinkedIn (opens a new tab)"
          >
            <span className="linkedin-share" aria-hidden="true">
              in
            </span>
            LinkedIn
          </a>
          <a
            href={image || undefined}
            download="openraise-campaign.png"
            aria-label="Download campaign share card"
          >
            <span>
              <Download size={22} aria-hidden="true" />
            </span>
            Download
          </a>
        </div>
        <label htmlFor={`${id}-link`}>Campaign link</label>
        <div className="share-copy-field">
          <input
            ref={linkInput}
            id={`${id}-link`}
            readOnly
            value={url}
            onFocus={(e) => e.target.select()}
          />
          <button
            className="icon-button"
            aria-label={copied ? 'Link copied' : 'Copy campaign link'}
            onClick={() => void copy()}
          >
            {copied ? <Check size={19} /> : <Copy size={19} />}
          </button>
        </div>
        <p className="share-status" role="status">
          {message || 'Only the public campaign link is shared.'}
        </p>
        {
          <button
            className="secondary-button native-share"
            onClick={async () => {
              try {
                if (navigator.share) await navigator.share({ title, url });
                else setMessage('Choose one of the sharing options above.');
              } catch (error) {
                if (!(error instanceof Error && error.name === 'AbortError'))
                  setMessage('Choose one of the sharing options above.');
              }
            }}
          >
            More sharing options <ExternalLink size={15} aria-hidden="true" />
          </button>
        }
      </dialog>
    </>
  );
}
