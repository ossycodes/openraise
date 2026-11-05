'use client';
import Image from 'next/image';
import { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Expand, X, ImageIcon } from 'lucide-react';
import type { Campaign } from '../_lib/campaign';
export function CampaignGallery({ campaign }: { campaign: Campaign }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const image = campaign.images[index];
  return (
    <>
      <div
        className={`campaign-cover ${!campaign.coverImageUrl || failed ? 'without-photo' : ''}`}
      >
        {campaign.coverImageUrl && !failed ? (
          <Image
            src={campaign.coverImageUrl}
            alt={`Cover photo for ${campaign.title}`}
            fill
            priority
            sizes="(max-width: 900px) 100vw, 740px"
            className="cover-photo"
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="cover-empty">
            <ImageIcon size={36} strokeWidth={1.2} aria-hidden="true" />
            <span>A story worth supporting</span>
            <p>The organiser hasn’t added a campaign photo.</p>
          </div>
        )}
        {campaign.coverImageUrl && !failed && (
          <button
            className="photo-button"
            type="button"
            onClick={() => dialog.current?.showModal()}
          >
            <Expand size={15} aria-hidden="true" />
            View{' '}
            {campaign.images.length > 1
              ? `${campaign.images.length} photos`
              : 'photo'}
          </button>
        )}
      </div>
      <dialog
        ref={dialog}
        className="gallery-dialog"
        aria-labelledby="gallery-title"
      >
        <div className="gallery-toolbar">
          <h2 id="gallery-title">Campaign photos</h2>
          <button
            className="icon-button"
            aria-label="Close photos"
            onClick={() => dialog.current?.close()}
          >
            <X />
          </button>
        </div>
        {image && (
          <div className="full-photo">
            <Image
              src={image.url}
              alt={`Campaign photo ${index + 1} of ${campaign.images.length}: ${campaign.title}`}
              fill
              sizes="90vw"
            />
          </div>
        )}
        <div className="gallery-controls">
          <button
            className="icon-button"
            aria-label="Previous photo"
            disabled={index === 0}
            onClick={() => setIndex((value) => value - 1)}
          >
            <ArrowLeft />
          </button>
          <span>
            {index + 1} / {campaign.images.length}
          </span>
          <button
            className="icon-button"
            aria-label="Next photo"
            disabled={index >= campaign.images.length - 1}
            onClick={() => setIndex((value) => value + 1)}
          >
            <ArrowRight />
          </button>
        </div>
      </dialog>
    </>
  );
}
