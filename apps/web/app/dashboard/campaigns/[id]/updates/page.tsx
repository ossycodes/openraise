import Link from 'next/link';
import { notFound } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { apiAs } from '../../../../_lib/api';
import type { UpdatePage } from '../../../../_lib/campaign';
import { myCampaigns } from '../../../_lib/data';
import { CampaignTabs } from '../../../_components/dashboard-nav';
import { UpdateForm } from '../../../_components/update-form';
export const metadata = { title: 'Campaign updates' };
export default async function UpdatesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const path = `/dashboard/campaigns/${id}/updates`;
  const campaign = (await myCampaigns(path)).find((c) => c.id === id);
  if (!campaign) notFound();
  const requested = Number((await searchParams).page ?? 1);
  const page =
    Number.isInteger(requested) && requested >= 1 && requested <= 1000
      ? requested
      : 1;
  const updates = await apiAs<UpdatePage>(
    `/campaigns/${encodeURIComponent(id)}/updates/mine?page=${page}`,
    { returnTo: path },
  );
  async function remove(form: FormData) {
    'use server';
    const updateId = String(form.get('updateId') ?? '');
    if (!updateId) return;
    await apiAs(`/campaign-updates/${encodeURIComponent(updateId)}`, {
      method: 'DELETE',
      returnTo: path,
    });
    revalidatePath(path);
    revalidatePath(`/campaigns/${campaign!.slug}`);
  }
  return (
    <>
      <Link href="/dashboard" className="back-link">
        ← Your campaigns
      </Link>
      <div className="dashboard-heading">
        <div>
          <div className="section-eyebrow">Keep the story moving</div>
          <h1>Campaign updates</h1>
          <p className="dashboard-lede">{campaign.title}</p>
        </div>
        <Link
          className="secondary-button"
          href={`/campaigns/${campaign.slug}#updates`}
        >
          View public updates ↗
        </Link>
      </div>
      <CampaignTabs id={id} />
      {['ACTIVE', 'PAUSED', 'ENDED'].includes(campaign.status) ? (
        <div className="dashboard-panel">
          <UpdateForm campaignId={id} />
        </div>
      ) : (
        <div className="dashboard-notice">
          Updates become available after your campaign is approved.
        </div>
      )}
      <section className="owner-update-history">
        <h2>Your published updates</h2>
        {updates.items.length === 0 ? (
          <p className="empty-copy">
            No updates yet. Share a little progress when you’re ready.
          </p>
        ) : (
          updates.items.map((update) => (
            <article className="owner-update-card" key={update.id}>
              <div>
                <time dateTime={update.publishedAt}>
                  {new Date(update.publishedAt).toLocaleDateString('en-GB', {
                    timeZone: 'Africa/Lagos',
                    dateStyle: 'medium',
                  })}
                </time>
                {update.hiddenAt && (
                  <span className="status-pill">Removed</span>
                )}
                <h3>{update.title}</h3>
                <p className="update-body">{update.body}</p>
                <small>{update.images.length} photos</small>
              </div>
              {!update.hiddenAt && (
                <form action={remove}>
                  <input type="hidden" name="updateId" value={update.id} />
                  <button className="text-button" type="submit">
                    Remove update
                  </button>
                </form>
              )}
            </article>
          ))
        )}
        <nav className="pager" aria-label="Your update pages">
          {page > 1 && <Link href={`?page=${page - 1}`}>Newer</Link>}
          {updates.hasMore && <Link href={`?page=${page + 1}`}>Older</Link>}
        </nav>
      </section>
    </>
  );
}
