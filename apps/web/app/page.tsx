import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowUpRight,
  ArrowRight,
  Heart,
  Globe2,
  ShieldCheck,
  Sprout,
  ReceiptText,
  Check,
  Code2,
  HandHeart,
  GraduationCap,
  Sparkles,
} from 'lucide-react';
import { formatMoney } from '@openraise/shared';
import { SiteFooter, SiteHeader } from './_components/site-header';
import { apiOrigin, previewEnabled } from './_lib/campaign-server';
import { progressPercent, type Campaign } from './_lib/campaign';

interface Category {
  slug: string;
  name: string;
}
async function read<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${apiOrigin()}${path}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok ? response.json() : null;
  } catch {
    return null;
  }
}
const SORTS = [
  { value: '', label: 'Best match / newest' },
  { value: 'trending', label: 'Trending' },
  { value: 'close-to-goal', label: 'Close to goal' },
  { value: 'newest', label: 'Newest' },
] as const;

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string; sort?: string }>;
}) {
  const params = await searchParams;
  const requested = params.category ?? '';
  const category = /^[a-z0-9-]{1,50}$/.test(requested) ? requested : '';
  const q = (params.q ?? '').trim().slice(0, 100);
  const sort = SORTS.some((s) => s.value === params.sort) ? (params.sort ?? '') : '';
  const listQuery = new URLSearchParams({ limit: '12' });
  if (category) listQuery.set('category', category);
  if (q) listQuery.set('q', q);
  if (sort) listQuery.set('sort', sort);
  /** Category links keep the current search and sort. */
  const browseHref = (slug: string) => {
    const next = new URLSearchParams();
    if (slug) next.set('category', slug);
    if (q) next.set('q', q);
    if (sort) next.set('sort', sort);
    const qs = next.toString();
    return `/${qs ? `?${qs}` : ''}#campaigns`;
  };
  const [listing, categories, fees] = await Promise.all([
    read<{ items: Campaign[]; total: number }>(`/campaigns?${listQuery}`),
    read<Category[]>('/categories'),
    read<{ platformFeeBps: number }>('/config/fees'),
  ]);
  const campaigns = listing?.items ?? null;
  const featured = campaigns?.[0];
  const platformFee = fees
    ? `${fees.platformFeeBps / 100}%`
    : 'Shown before giving';
  return (
    <>
      <SiteHeader preview={previewEnabled()} />
      <main id="main" className="discovery-page">
        <section className="discovery-hero">
          <div className="hero-copy">
            <div className="section-eyebrow">
              <Sprout size={15} aria-hidden="true" /> A little kindness. A world
              of possibility.
            </div>
            <h1>
              Someone’s next chapter
              <br />
              could start <em>with you.</em>
            </h1>
            <p>
              Big dreams. Difficult moments. New beginnings. Help a community
              turn “one day” into something real.
            </p>
            <a className="primary-button" href="#campaigns">
              Find a cause to support{' '}
              <ArrowRight size={18} aria-hidden="true" />
            </a>
            <div className="hero-assurances">
              <span>
                <ShieldCheck size={16} aria-hidden="true" /> Fees shown upfront
              </span>
              <span>
                <Heart size={16} aria-hidden="true" /> Give without an account
              </span>
            </div>
          </div>
          <div className="hero-story">
            {featured ? (
              <Link
                href={`/campaigns/${featured.slug}`}
                className="hero-feature"
              >
                <div className="hero-feature-photo">
                  {featured.coverImageUrl ? (
                    <Image
                      src={featured.coverImageUrl}
                      alt={featured.title}
                      fill
                      priority
                      sizes="(max-width: 850px) 100vw, 520px"
                    />
                  ) : (
                    <HandHeart size={90} strokeWidth={1} aria-hidden="true" />
                  )}
                </div>
                <div className="hero-feature-caption">
                  <span>ONE STORY. SO MANY POSSIBILITIES.</span>
                  <h2>{featured.title}</h2>
                  <div>
                    <span>
                      {formatMoney(
                        BigInt(featured.raisedAmount),
                        featured.currency,
                      )}{' '}
                      raised
                    </span>
                    <ArrowUpRight size={22} aria-hidden="true" />
                  </div>
                </div>
              </Link>
            ) : (
              <div className="hero-illustration">
                <HandHeart size={100} strokeWidth={1} aria-hidden="true" />
                <h2>
                  Good grows
                  <br />
                  when we give.
                </h2>
                <p>Every story starts with someone who cares.</p>
              </div>
            )}
            <div className="hero-note">
              <Heart size={19} aria-hidden="true" />
              <span>
                Small acts.
                <br />
                <strong>Lasting possibilities.</strong>
              </span>
            </div>
          </div>
        </section>
        <div className="belief-strip">
          <span>Built around people.</span>
          <span>
            <ReceiptText size={18} aria-hidden="true" /> Transparent giving
          </span>
          <span>
            <Globe2 size={18} aria-hidden="true" /> Local stories, wider support
          </span>
          <span>
            <Code2 size={18} aria-hidden="true" /> Open source at heart
          </span>
        </div>
        <section className="browse-section" id="campaigns">
          <div className="discovery-section-heading">
            <div>
              <div className="section-eyebrow">Find your reason to give</div>
              <h2>
                Good causes. <em>Close to your heart.</em>
              </h2>
            </div>
            <p>
              Browse by category and find a story you can help move forward.
            </p>
          </div>
          <form
            className="campaign-search"
            role="search"
            method="get"
            action="/#campaigns"
          >
            {category && <input type="hidden" name="category" value={category} />}
            <label className="visually-hidden" htmlFor="campaign-search-q">
              Search campaigns
            </label>
            <input
              id="campaign-search-q"
              type="search"
              name="q"
              defaultValue={q}
              maxLength={100}
              placeholder="Search by name, place or cause"
            />
            <label className="visually-hidden" htmlFor="campaign-search-sort">
              Sort campaigns
            </label>
            <select id="campaign-search-sort" name="sort" defaultValue={sort}>
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <button type="submit" className="primary-button">
              Search
            </button>
          </form>
          <nav className="category-browser" aria-label="Campaign categories">
            <Link
              href={browseHref('')}
              aria-current={!category ? 'page' : undefined}
            >
              All causes
            </Link>
            {(categories ?? []).map((item) => (
              <Link
                key={item.slug}
                href={browseHref(item.slug)}
                aria-current={category === item.slug ? 'page' : undefined}
              >
                {item.name}
              </Link>
            ))}
          </nav>
          {categories === null && (
            <p className="privacy-note">
              Category filters are unavailable. The campaign list is still
              available below.
            </p>
          )}
          <div className="browse-result-label">
            <h3>
              {q
                ? `Results for “${q}”`
                : category
                  ? (categories?.find((c) => c.slug === category)?.name ??
                    'Selected category')
                  : 'Stories worth showing up for'}
            </h3>
            <span>
              {listing
                ? `${listing.total} ${listing.total === 1 ? 'campaign' : 'campaigns'}`
                : 'Campaign directory'}
            </span>
          </div>
          <div className="campaign-grid">
            {campaigns?.map((campaign) => {
              const percent = progressPercent(
                campaign.raisedAmount,
                campaign.goalAmount,
              );
              return (
                <Link
                  key={campaign.id}
                  className="campaign-tile"
                  href={`/campaigns/${campaign.slug}`}
                >
                  <div className="tile-image">
                    {campaign.coverImageUrl ? (
                      <Image
                        src={campaign.coverImageUrl}
                        alt={`Cover for ${campaign.title}`}
                        fill
                        sizes="(max-width: 540px) 100vw, 400px"
                      />
                    ) : (
                      <HandHeart
                        size={45}
                        strokeWidth={1.2}
                        aria-hidden="true"
                      />
                    )}
                    <span className="tile-category">
                      {campaign.category.name}
                    </span>
                  </div>
                  <div className="tile-content">
                    <h3>{campaign.title}</h3>
                    <p>{campaign.summary}</p>
                    <div
                      className="tile-progress"
                      role="progressbar"
                      aria-label={`${campaign.title} fundraising progress`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.min(100, percent)}
                    >
                      <span style={{ width: `${Math.min(100, percent)}%` }} />
                    </div>
                    <div className="tile-meta">
                      <strong>
                        {formatMoney(
                          BigInt(campaign.raisedAmount),
                          campaign.currency,
                        )}{' '}
                        <span>raised</span>
                      </strong>
                      <span>{Math.round(percent)}%</span>
                    </div>
                    <div className="tile-bottom">
                      <span>
                        <Heart size={14} aria-hidden="true" />{' '}
                        {campaign.donorCount} supporters
                      </span>
                      <ArrowUpRight size={19} aria-hidden="true" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
          {campaigns === null && (
            <div className="discovery-empty">
              <Sprout size={32} aria-hidden="true" />
              <h3>These stories need a moment.</h3>
              <p>Campaigns couldn’t be loaded. Try refreshing the page.</p>
              <a
                className="secondary-button"
                href={
                  category ? `/?category=${category}#campaigns` : '/#campaigns'
                }
              >
                Try again <ArrowRight size={16} aria-hidden="true" />
              </a>
            </div>
          )}
          {campaigns?.length === 0 && (
            <div className="discovery-empty">
              <Sprout size={32} aria-hidden="true" />
              <h3>A new story is on its way.</h3>
              <p>
                {q
                  ? `No campaigns match “${q}”. Try other words or another category.`
                  : category
                    ? 'There are no active campaigns in this category yet.'
                    : 'There are no active campaigns yet. Check back for new stories.'}
              </p>
              {(category || q) && (
                <Link href="/#campaigns" className="secondary-button">
                  Explore all causes <ArrowRight size={16} aria-hidden="true" />
                </Link>
              )}
            </div>
          )}
        </section>
        <section className="giving-steps" id="giving-details">
          <div>
            <div className="section-eyebrow">
              From a little care to a little change
            </div>
            <h2>
              Giving should feel
              <br />
              <em>this simple.</em>
            </h2>
          </div>
          <ol>
            {[
              {
                icon: GraduationCap,
                title: 'Find a story',
                text: 'Choose a cause that matters to you. Meet the people and understand the goal.',
              },
              {
                icon: Heart,
                title: 'Make it possible',
                text: 'Choose your amount, review every fee and give through hosted checkout.',
              },
              {
                icon: ReceiptText,
                title: 'See it confirmed',
                text: 'Return to check your payment. Your receipt is emailed after confirmation.',
              },
            ].map((step, i) => (
              <li key={step.title}>
                <span className="step-number">0{i + 1}</span>
                <step.icon size={24} strokeWidth={1.5} aria-hidden="true" />
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </section>
        <section className="payments-section" id="payments">
          <div className="payment-copy">
            <div className="section-eyebrow">
              <Globe2 size={15} aria-hidden="true" /> Giving, with fewer borders
            </div>
            <h2>
              Rooted in community.
              <br />
              <em>Open to possibility.</em>
            </h2>
            <p>
              Campaigns can raise in Nigerian naira, US dollars, Ghanaian cedi
              or Kenyan shillings. Each campaign shows its currency and exact
              donation total before you pay.
            </p>
            <div className="payment-highlights">
              <div>
                <Globe2 aria-hidden="true" />
                <strong>4 campaign currencies</strong>
                <span>NGN · USD · GHS · KES</span>
              </div>
              <div>
                <ShieldCheck aria-hidden="true" />
                <strong>Hosted checkout</strong>
                <span>Your payment provider handles payment details</span>
              </div>
            </div>
          </div>
          <div className="currency-card">
            <div className="currency-card-title">
              <h3>A currency for your cause</h3>
              <span>CAMPAIGN CURRENCIES</span>
            </div>
            {[
              { flag: '🇳🇬', code: 'NGN', name: 'Nigerian naira' },
              { flag: '🇺🇸', code: 'USD', name: 'US dollar' },
              { flag: '🇬🇭', code: 'GHS', name: 'Ghanaian cedi' },
              { flag: '🇰🇪', code: 'KES', name: 'Kenyan shilling' },
            ].map((c) => (
              <div className="currency-row" key={c.code}>
                <span className="currency-flag" aria-hidden="true">
                  {c.flag}
                </span>
                <strong>{c.code}</strong>
                <span>{c.name}</span>
                <Check size={17} aria-label="Supported campaign currency" />
              </div>
            ))}
            <p className="currency-note">
              Payment methods and currency availability depend on this
              deployment’s configured provider. Donations use the campaign’s
              currency.
            </p>
            <div className="provider-integrations">
              <ShieldCheck size={17} aria-hidden="true" />
              <span>Provider integrations</span>
              <strong>Paystack</strong>
              <strong>Bachs</strong>
            </div>
          </div>
        </section>
        <section className="why-section" id="about">
          <div className="discovery-section-heading">
            <div>
              <div className="section-eyebrow">More clarity. More care.</div>
              <h2>
                A good cause deserves
                <br />
                <em>a clear way forward.</em>
              </h2>
            </div>
            <p>
              Built for communities who want to understand where their support
              goes.
            </p>
          </div>
          <p className="table-scroll-hint">
            Swipe the table to see every detail →
          </p>
          <div
            className="feature-table-wrap"
            role="region"
            aria-label="OpenRaise features"
            tabIndex={0}
          >
            <table className="feature-table">
              <caption className="sr-only">
                OpenRaise features and what they mean for donors
              </caption>
              <thead>
                <tr>
                  <th scope="col">Made for your community</th>
                  <th scope="col">OpenRaise</th>
                  <th scope="col">What it means for you</th>
                </tr>
              </thead>
              <tbody>
                {[
                  [
                    'Platform fee',
                    platformFee,
                    'The configured fee is shown before you give.',
                  ],
                  [
                    'Guest donations',
                    'No account needed',
                    'Give with an email address for your receipt.',
                  ],
                  [
                    'Campaign currencies',
                    'NGN · USD · GHS · KES',
                    'Each campaign raises in one currency.',
                  ],
                  [
                    'Payment confirmation',
                    'Provider-confirmed',
                    'A redirect alone never marks a donation as paid.',
                  ],
                  [
                    'Donation receipts',
                    'Sent by email',
                    'Queued after a payment is confirmed.',
                  ],
                  [
                    'Open source',
                    'Self-hostable',
                    'Inspect the code and host your own deployment.',
                  ],
                ].map((row) => (
                  <tr key={row[0]}>
                    <th scope="row">{row[0]}</th>
                    <td>
                      <Check size={16} aria-hidden="true" />
                      {row[1]}
                    </td>
                    <td>{row[2]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="privacy-note">
            Processing fees are separate from the platform fee. You’ll see your
            full total and the amount reaching the campaign before checkout.
          </p>
        </section>
        <section className="discovery-closing">
          <Sparkles size={30} strokeWidth={1.2} aria-hidden="true" />
          <div>
            <h2>
              The next chapter starts
              <br />
              with someone who cares.
            </h2>
            <p>Be that someone. Find a cause and help it grow.</p>
          </div>
          <a className="primary-button" href="#campaigns">
            Explore campaigns <ArrowRight size={18} aria-hidden="true" />
          </a>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
