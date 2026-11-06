import 'server-only';
import { headers } from 'next/headers';
import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
/** Only read a deployment-selected header which the trusted edge overwrites. */
export async function rateLimitHeaders(
  method: string,
  path: string,
  source?: Headers,
): Promise<Record<string, string>> {
  if (method.toUpperCase() !== 'POST') return {};
  const secret = process.env.RATE_LIMIT_RELAY_SECRET;
  if (!secret) return {};
  if (secret.length < 32)
    throw new Error('Rate-limit relay secret must have at least 32 characters');
  const name = process.env.RATE_LIMIT_CLIENT_IP_HEADER?.toLowerCase();
  const incoming = source ?? (await headers());
  const raw = name
    ? incoming.get(name)
    : process.env.NODE_ENV === 'production'
      ? null
      : '127.0.0.1';
  if (!raw || !isIP(raw) || raw.length > 80)
    throw new Error(
      'Configure a trusted single-IP header for the rate-limit relay',
    );
  let address = raw;
  if (isIP(raw) === 6) {
    address = new URL(`http://[${raw}]`).hostname.slice(1, -1);
    const match = /^::ffff:([a-f0-9]{1,4}):([a-f0-9]{1,4})$/.exec(address);
    if (match) {
      const a = parseInt(match[1]!, 16),
        b = parseInt(match[2]!, 16);
      address = `${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`;
    }
  }
  const timestamp = String(Date.now()),
    pathname = new URL(path, 'http://internal').pathname;
  const signature = createHmac('sha256', secret)
    .update(`${timestamp}\n${method.toUpperCase()}\n${pathname}\n${address}`)
    .digest('hex');
  return {
    'x-openraise-client-ip': address,
    'x-openraise-relay-time': timestamp,
    'x-openraise-relay-signature': signature,
  };
}
