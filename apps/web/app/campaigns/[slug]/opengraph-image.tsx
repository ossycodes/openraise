import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { formatMoney } from '@openraise/shared';
import { getCampaign, previewEnabled } from '../../_lib/campaign-server';
export const alt = 'Support a community campaign on OpenRaise';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
async function coverData(url: string | null): Promise<string | null> {
  try {
    if (previewEnabled() && url === '/preview/ada-study.png')
      return `data:image/png;base64,${(await readFile(path.join(process.cwd(), 'public/preview/ada-study.png'))).toString('base64')}`;
    const storage = new URL(
      process.env.STORAGE_PUBLIC_URL ?? 'http://localhost:8333/openraise',
    );
    const image = new URL(url ?? '');
    if (
      image.origin !== storage.origin ||
      !image.pathname.startsWith(`${storage.pathname.replace(/\/$/, '')}/`)
    )
      return null;
    const response = await fetch(image, {
      signal: AbortSignal.timeout(3000),
      cache: 'no-store',
    });
    const type = response.headers.get('content-type')?.split(';')[0];
    if (
      !response.ok ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(type ?? '')
    )
      return null;
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > 10_000_000) return null;
    return `data:${type};base64,${Buffer.from(bytes).toString('base64')}`;
  } catch {
    return null;
  }
}
export default async function CampaignImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const campaign = await getCampaign((await params).slug);
  const [font, cover] = await Promise.all([
    readFile(path.join(process.cwd(), 'public/fonts/dm-sans-600.ttf')),
    coverData(campaign.coverImageUrl),
  ]);
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        background: '#faf9f6',
        color: '#24392e',
        fontFamily: 'DM Sans',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: cover ? '62%' : '100%',
          padding: '52px 52px 44px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontSize: 30,
            color: '#1e5b43',
          }}
        >
          <span>openraise.</span>
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 42,
            fontSize: 16,
            color: '#81523e',
            letterSpacing: 2,
          }}
        >
          A LITTLE KINDNESS. A NEW POSSIBILITY.
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: campaign.title.length > 85 ? 36 : 48,
            lineHeight: 1.13,
            marginTop: 20,
          }}
        >
          {campaign.title.length > 180
            ? `${campaign.title.slice(0, 177)}…`
            : campaign.title}
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            marginTop: 'auto',
            gap: 10,
          }}
        >
          <span style={{ fontSize: 28, color: '#1e5b43' }}>
            {campaign.currency}{' '}
            {formatMoney(
              BigInt(campaign.raisedAmount),
              campaign.currency,
            ).replace(/^[^0-9]*/, '')}{' '}
            raised
          </span>
          <span style={{ fontSize: 17, color: '#617065' }}>
            {campaign.donorCount} supporters · {campaign.category.name}
          </span>
        </div>
      </div>
      {cover && (
        <div
          style={{
            display: 'flex',
            width: '38%',
            height: '100%',
            position: 'relative',
          }}
        >
          <img
            src={cover}
            alt="Campaign cover"
            width={456}
            height={630}
            style={{ objectFit: 'cover' }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: 40,
              left: 25,
              right: 25,
              display: 'flex',
              justifyContent: 'center',
              padding: '17px 20px',
              borderRadius: 30,
              background: '#ffffff',
              color: '#1e5b43',
              fontSize: 18,
            }}
          >
            Help this story grow ↗
          </div>
        </div>
      )}
    </div>,
    {
      ...size,
      fonts: [
        { name: 'DM Sans', data: new Uint8Array(font).buffer, weight: 600 },
      ],
    },
  );
}
