import { BlockList, isIP } from 'node:net';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
export function canonicalAddress(raw: string | undefined): string | null {
  if (!raw || raw.length > 80 || !isIP(raw)) return null;
  if (isIP(raw) === 4) return raw;
  let v: string;
  try {
    v = new URL(`http://[${raw}]`).hostname.slice(1, -1);
  } catch {
    return null;
  }
  const mapped = /^::ffff:([a-f0-9]{1,4}):([a-f0-9]{1,4})$/.exec(v);
  if (mapped) {
    const a = parseInt(mapped[1]!, 16),
      b = parseInt(mapped[2]!, 16);
    return `${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`;
  }
  return v;
}
/** Group IPv6 visitors by /64 so temporary address rotation does not reset a bucket. */
export function networkIdentity(address: string): string {
  if (isIP(address) !== 6) return address;
  const [left, right] = address.split('::');
  const a = left ? left.split(':') : [],
    b = right ? right.split(':') : [];
  const groups = address.includes('::')
    ? [...a, ...Array(8 - a.length - b.length).fill('0'), ...b]
    : a;
  return (
    groups
      .slice(0, 4)
      .map((v) => parseInt(v, 16).toString(16))
      .join(':') + '::/64'
  );
}
export function trustedProxies(value: string): BlockList {
  const list = new BlockList();
  for (const entry of value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)) {
    if (entry.split('/').length > 2)
      throw new Error('Invalid trusted proxy CIDR');
    const [raw, bits] = entry.split('/');
    const address = canonicalAddress(raw);
    if (!address)
      throw new Error(
        'Use IP addresses or CIDRs for RATE_LIMIT_TRUSTED_PROXIES',
      );
    const family = isIP(address) === 4 ? 'ipv4' : 'ipv6';
    if (bits === undefined) list.addAddress(address, family);
    else {
      if (!/^\d+$/.test(bits)) throw new Error('Invalid trusted proxy CIDR');
      list.addSubnet(address, Number(bits), family);
    }
  }
  return list;
}
export function relaySignature(
  secret: string,
  method: string,
  path: string,
  address: string,
  timestamp: string,
) {
  return createHmac('sha256', secret)
    .update(`${timestamp}\n${method.toUpperCase()}\n${path}\n${address}`)
    .digest('hex');
}
export function clientAddress(
  request: Request,
  proxies: BlockList,
  secret?: string,
  now = Date.now(),
): string {
  const direct = canonicalAddress(request.socket.remoteAddress) ?? 'unknown';
  const forwarded = canonicalAddress(request.get('x-openraise-client-ip'));
  const timestamp = request.get('x-openraise-relay-time') ?? '',
    signature = request.get('x-openraise-relay-signature') ?? '';
  if (
    secret &&
    forwarded &&
    /^\d{13}$/.test(timestamp) &&
    Math.abs(now - Number(timestamp)) <= 30000 &&
    /^[a-f0-9]{64}$/.test(signature)
  ) {
    const expected = relaySignature(
      secret,
      request.method,
      request.path,
      forwarded,
      timestamp,
    );
    if (
      timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expected, 'hex'),
      )
    )
      return forwarded;
  }
  const trusted = (ip: string) =>
    !!isIP(ip) && proxies.check(ip, isIP(ip) === 4 ? 'ipv4' : 'ipv6');
  if (!trusted(direct)) return direct;
  const chain = request.get('x-forwarded-for');
  if (!chain || chain.length > 2048) return direct;
  const addresses = chain.split(',').map((v) => canonicalAddress(v.trim()));
  if (addresses.some((v) => !v) || addresses.length > 20) return direct;
  let current = direct;
  for (let i = addresses.length - 1; i >= 0 && trusted(current); i--)
    current = addresses[i]!;
  return current;
}
