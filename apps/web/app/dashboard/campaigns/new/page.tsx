import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { CampaignForm } from '../../_components/campaign-form';
import { categories } from '../../_lib/data';

export const metadata = { title: 'New campaign' };

export default async function NewCampaignPage() {
  return (
    <>
      <Link href="/dashboard" className="back-link">
        <ArrowLeft size={16} aria-hidden="true" /> Your campaigns
      </Link>
      <div className="dashboard-heading">
        <div>
          <div className="section-eyebrow">New campaign</div>
          <h1>Tell people what you’re raising for</h1>
          <p className="dashboard-lede">
            This saves a private draft. Add photos next, then submit it for
            review when you’re ready.
          </p>
        </div>
      </div>
      <div className="dashboard-panel">
        <CampaignForm categories={await categories()} />
      </div>
    </>
  );
}
