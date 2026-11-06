import type { Request } from 'express';
import {
  canonicalAddress,
  networkIdentity,
  trustedProxies,
  clientAddress,
  relaySignature,
} from './client-address.js';
const req = (
  remote: string,
  headers: Record<string, string> = {},
  path = '/auth/signin',
) =>
  ({
    socket: { remoteAddress: remote },
    method: 'POST',
    path,
    get: (name: string) => headers[name],
  }) as unknown as Request;
describe('trusted visitor addresses', () => {
  it('normalizes mapped IPv4 and IPv6 spellings and groups /64 networks', () => {
    expect(canonicalAddress('::ffff:192.0.2.5')).toBe('192.0.2.5');
    expect(canonicalAddress('::ffff:c000:205')).toBe('192.0.2.5');
    expect(canonicalAddress('2001:0DB8:0:0:0:0:0:1')).toBe('2001:db8::1');
    expect(networkIdentity('2001:db8::1')).toBe(
      networkIdentity('2001:db8::ffff'),
    );
    expect(networkIdentity('2001:db8:0:1::1')).not.toBe(
      networkIdentity('2001:db8::1'),
    );
    expect(canonicalAddress('garbage')).toBeNull();
  });
  it('ignores arbitrary forwarded headers from an untrusted socket', () => {
    expect(
      clientAddress(
        req('192.0.2.1', {
          'x-forwarded-for': '198.51.100.1',
          'x-openraise-client-ip': '198.51.100.2',
        }),
        trustedProxies(''),
      ),
    ).toBe('192.0.2.1');
  });
  it('walks only the configured proxy chain and stops before a spoofed leftmost entry', () => {
    const proxies = trustedProxies('10.0.0.0/8');
    expect(
      clientAddress(
        req('10.0.0.1', {
          'x-forwarded-for': '203.0.113.99, 198.51.100.1, 10.0.0.2',
        }),
        proxies,
      ),
    ).toBe('198.51.100.1');
    expect(
      clientAddress(
        req('10.0.0.1', { 'x-forwarded-for': 'invalid,198.51.100.1' }),
        proxies,
      ),
    ).toBe('10.0.0.1');
  });
  it('accepts only fresh signatures bound to the method, path and address', () => {
    const secret = 's'.repeat(32),
      time = String(Date.now()),
      headers = {
        'x-openraise-client-ip': '198.51.100.2',
        'x-openraise-relay-time': time,
        'x-openraise-relay-signature': relaySignature(
          secret,
          'POST',
          '/auth/signin',
          '198.51.100.2',
          time,
        ),
      };
    expect(
      clientAddress(req('127.0.0.1', headers), trustedProxies(''), secret),
    ).toBe('198.51.100.2');
    expect(
      clientAddress(
        req('127.0.0.1', headers, '/auth/signup'),
        trustedProxies(''),
        secret,
      ),
    ).toBe('127.0.0.1');
    expect(
      clientAddress(
        req('127.0.0.1', headers),
        trustedProxies(''),
        secret,
        Number(time) + 31000,
      ),
    ).toBe('127.0.0.1');
  });
  it('rejects unsafe or invalid proxy configuration', () => {
    for (const value of [
      'true',
      '1',
      '0.0.0.0/33',
      '::/129',
      '10.0.0.1/8/extra',
    ])
      expect(() => trustedProxies(value)).toThrow();
  });
});
