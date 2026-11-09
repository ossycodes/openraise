import type { NextRequest } from 'next/server';
import { CampaignLoadError, getCampaign } from '../../../_lib/campaign-server';
import { qrPng, qrSvg, shortUrl } from '../../../_lib/qr';

/**
 * The campaign's QR code, pointing at its short link. `?format=svg` for
 * printers and designers, PNG otherwise; `?download=1` saves it as a file.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  let code: string;
  try {
    code = (await getCampaign(slug)).shortCode;
  } catch (error) {
    if (error instanceof CampaignLoadError && error.status === 404)
      return new Response('Campaign not found', { status: 404 });
    return new Response('Campaign unavailable', { status: 503 });
  }
  const svg = request.nextUrl.searchParams.get('format') === 'svg';
  const headers = new Headers({
    'Content-Type': svg ? 'image/svg+xml' : 'image/png',
    'Cache-Control': 'public, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
  });
  if (request.nextUrl.searchParams.get('download') === '1')
    headers.set(
      'Content-Disposition',
      `attachment; filename="${code}-qr-code.${svg ? 'svg' : 'png'}"`,
    );
  const url = shortUrl(code);
  return new Response(
    svg ? await qrSvg(url) : new Uint8Array(await qrPng(url)),
    { headers },
  );
}
