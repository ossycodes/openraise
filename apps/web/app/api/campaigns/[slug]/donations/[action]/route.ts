import type { NextRequest } from 'next/server';
import { proxyPayment } from '../../../../../_lib/payment-proxy';
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string; action: string }> },
) {
  const { slug, action } = await context.params;
  return proxyPayment(request, slug, action);
}
