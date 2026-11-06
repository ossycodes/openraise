'use client';
import Image from 'next/image';
import { useId, useState } from 'react';
import { ExternalLink, Images, Play, Video } from 'lucide-react';
import { canonicalYoutubeUrl, youtubeVideoId } from '@openraise/shared';
import type { Campaign } from '../_lib/campaign';
import { CampaignGallery } from './campaign-gallery';
export function CampaignMedia({
  campaign,
}: {
  campaign: Pick<
    Campaign,
    'id' | 'title' | 'coverImageUrl' | 'images' | 'videoUrl'
  >;
}) {
  const id = useId();
  const videoId = campaign.videoUrl ? youtubeVideoId(campaign.videoUrl) : null;
  const [mode, setMode] = useState<'video' | 'photos'>(
    videoId ? 'video' : 'photos',
  );
  const [loaded, setLoaded] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  if (!videoId) return <CampaignGallery campaign={campaign} />;
  const watchUrl = canonicalYoutubeUrl(campaign.videoUrl!)!;
  const hasPhotos = !!campaign.coverImageUrl || campaign.images.length > 0;
  return (
    <div className="campaign-media">
      <div className="campaign-media-controls" aria-label="Campaign media">
        <button
          type="button"
          aria-pressed={mode === 'video'}
          aria-controls={`${id}-content`}
          onClick={() => setMode('video')}
        >
          <Video size={16} aria-hidden="true" />
          Campaign video
        </button>
        {hasPhotos && (
          <button
            type="button"
            aria-pressed={mode === 'photos'}
            aria-controls={`${id}-content`}
            onClick={() => {
              setMode('photos');
              setLoaded(false);
            }}
          >
            <Images size={16} aria-hidden="true" />
            Photos
            {campaign.images.length > 0 ? ` (${campaign.images.length})` : ''}
          </button>
        )}
      </div>
      <div id={`${id}-content`}>
        {mode === 'photos' ? (
          <CampaignGallery campaign={campaign} />
        ) : (
          <>
            <div className={`campaign-video ${loaded ? 'is-loaded' : ''}`}>
              {loaded ? (
                <iframe
                  ref={(frame) => frame?.focus()}
                  key={videoId}
                  src={`https://www.youtube-nocookie.com/embed/${videoId}?playsinline=1&rel=0`}
                  title={`Campaign video: ${campaign.title}`}
                  allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              ) : (
                <>
                  {campaign.coverImageUrl && !posterFailed && (
                    <Image
                      src={campaign.coverImageUrl}
                      alt=""
                      fill
                      priority
                      sizes="(max-width: 900px) 100vw, 782px"
                      className="video-poster"
                      onError={() => setPosterFailed(true)}
                    />
                  )}
                  <div className="video-introduction">
                    <span className="video-eyebrow">
                      The story, in their own words
                    </span>
                    <h3>
                      A message from
                      <br />
                      the organiser.
                    </h3>
                    <button
                      type="button"
                      className="video-load-button"
                      onClick={() => setLoaded(true)}
                    >
                      <span className="video-play-icon">
                        <Play
                          size={21}
                          fill="currentColor"
                          aria-hidden="true"
                        />
                      </span>
                      Load YouTube video
                    </button>
                    <p>YouTube loads only when you choose to watch.</p>
                  </div>
                </>
              )}
            </div>
            <div className="video-details">
              <span>
                {loaded
                  ? 'Press play to watch. YouTube controls playback.'
                  : 'Video hosted on YouTube.'}
              </span>
              <a href={watchUrl} target="_blank" rel="noreferrer">
                Watch on YouTube <ExternalLink size={13} aria-hidden="true" />
                <span className="sr-only"> (opens a new tab)</span>
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
