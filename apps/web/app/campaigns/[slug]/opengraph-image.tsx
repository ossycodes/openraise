import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { formatMoney } from '@openraise/shared';
import { getCampaign } from '../../_lib/campaign-server';
export const alt = 'Support a community campaign on OpenRaise';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export default async function CampaignImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const campaign = await getCampaign((await params).slug);
  const font = await readFile(
    path.join(process.cwd(), 'public/fonts/dm-sans-600.ttf'),
  );
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: 70,
        background: '#faf9f6',
        color: '#24392e',
        fontFamily: 'DM Sans',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 30,
          color: '#1e5b43',
        }}
      >
        <span>openraise.</span>
        <span>{campaign.category.name}</span>
      </div>
      <div
        style={{
          fontSize: 64,
          lineHeight: 1.15,
          marginTop: 65,
          display: 'flex',
        }}
      >
        {campaign.title}
      </div>
      <div
        style={{
          display: 'flex',
          marginTop: 'auto',
          fontSize: 30,
          color: '#1e5b43',
        }}
      >
        {formatMoney(BigInt(campaign.raisedAmount), campaign.currency)} raised ·{' '}
        {campaign.donorCount} supporters
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: 'DM Sans', data: new Uint8Array(font).buffer, weight: 600 },
      ],
    },
  );
}
