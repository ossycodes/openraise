import Image from 'next/image';
import Link from 'next/link';
import { Sprout, Newspaper } from 'lucide-react';
import type { UpdatePage } from '../_lib/campaign';
export function UpdatesFeed({ updates }: { updates: UpdatePage | null }) {
  return (
    <section id="updates" className="updates-section">
      <div className="section-eyebrow">The story keeps growing</div>
      <h2>Notes from the organiser</h2>
      {updates === null ? (
        <div className="updates-empty">
          <p>Updates couldn’t be loaded right now.</p>
          <Link href="?updatesPage=1#updates">Try loading updates again</Link>
        </div>
      ) : updates.items.length ? (
        <div className="updates-timeline">
          {updates.items.map((update) => (
            <article className="campaign-update" key={update.id}>
              <div className="update-marker">
                <Newspaper size={17} aria-hidden="true" />
              </div>
              <div className="update-byline">
                <span>Organiser update</span>
                <time dateTime={update.publishedAt}>
                  {new Intl.DateTimeFormat('en-GB', {
                    dateStyle: 'medium',
                    timeZone: 'Africa/Lagos',
                  }).format(new Date(update.publishedAt))}
                </time>
              </div>
              <h3>{update.title}</h3>
              <p className="update-body">{update.body}</p>
              {update.images.length > 0 && (
                <div className="update-images">
                  {update.images.map((image, i) => (
                    <a
                      key={image.id}
                      href={image.url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open photo ${i + 1} from ${update.title} (new tab)`}
                    >
                      <Image
                        src={image.url}
                        alt={`Photo ${i + 1} accompanying ${update.title}`}
                        width={800}
                        height={600}
                        sizes="(max-width:540px) 100vw, 380px"
                      />
                    </a>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="updates-empty">
          <Sprout size={28} strokeWidth={1.3} aria-hidden="true" />
          <h3>The next chapter is still unfolding.</h3>
          <p>Updates from the organiser will appear here.</p>
        </div>
      )}
      {updates && (updates.page > 1 || updates.hasMore) && (
        <nav className="pager" aria-label="Campaign update pages">
          {updates.page > 1 && (
            <Link href={`?updatesPage=${updates.page - 1}#updates`}>
              Newer updates
            </Link>
          )}
          {updates.hasMore && (
            <Link href={`?updatesPage=${updates.page + 1}#updates`}>
              Older updates
            </Link>
          )}
        </nav>
      )}
    </section>
  );
}
