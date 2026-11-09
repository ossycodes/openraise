import { notFound, redirect } from 'next/navigation';
import { apiOrigin } from '../../_lib/campaign-server';

/**
 * Short links from posters and QR codes: /c/k7m2q goes to the campaign page.
 * Unknown codes, and campaigns that aren't public, show the not-found page;
 * an API outage throws, so a working poster never looks like a dead one.
 */
export default async function ShortLink({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  if (!/^[a-z0-9]{5}$/i.test(code)) notFound();
  const response = await fetch(
    `${apiOrigin()}/short-links/${encodeURIComponent(code)}`,
    { cache: 'no-store', signal: AbortSignal.timeout(5000) },
  );
  if (response.status === 404) notFound();
  if (!response.ok)
    throw new Error(`Short link lookup failed (${response.status})`);
  const { slug } = (await response.json()) as { slug: string };
  redirect(`/campaigns/${encodeURIComponent(slug)}`);
}
