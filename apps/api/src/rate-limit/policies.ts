import type { Env } from '../config/env.js';
export function policyFor(
  method: string,
  path: string,
): { name: string; limit: keyof Env; email?: boolean } | null {
  if (method !== 'POST') return null;
  if (['/auth/signin', '/auth/google'].includes(path))
    return { name: 'signin', limit: 'RATE_LIMIT_AUTH_MAX', email: true };
  if (path === '/auth/signup')
    return { name: 'signup', limit: 'RATE_LIMIT_SIGNUP_MAX' };
  if (path === '/auth/refresh')
    return { name: 'refresh', limit: 'RATE_LIMIT_REFRESH_MAX' };
  if (
    /^\/auth\/(?:password\/(?:forgot|reset)|verify-email(?:\/resend)?)$/.test(
      path,
    )
  )
    return { name: 'recovery', limit: 'RATE_LIMIT_RECOVERY_MAX', email: true };
  if (/^\/campaigns\/[^/]+\/donations\/(?:quote|checkout)$/.test(path))
    return {
      name: path.endsWith('/quote') ? 'quote' : 'checkout',
      limit: 'RATE_LIMIT_CHECKOUT_MAX',
    };
  if (/^\/campaigns\/[^/]+\/reports$/.test(path))
    return { name: 'report', limit: 'RATE_LIMIT_REPORT_MAX' };
  // Each invitation sends an email to an address the sender chose.
  if (/^\/organisations\/[^/]+\/invites$/.test(path))
    return { name: 'invite', limit: 'RATE_LIMIT_RECOVERY_MAX' };
  if (/^\/kyc(?:\/document)?$/.test(path))
    return { name: 'identity', limit: 'RATE_LIMIT_UPLOAD_MAX' };
  if (/^\/organisations\/[^/]+\/verification(?:\/document)?$/.test(path))
    return { name: 'identity', limit: 'RATE_LIMIT_UPLOAD_MAX' };
  if (
    /^\/campaigns\/[^/]+\/(?:images(?:\/.*)?|updates\/images(?:\/.*)?)$/.test(
      path,
    )
  )
    return { name: 'upload', limit: 'RATE_LIMIT_UPLOAD_MAX' };
  if (/^\/ai(?:\/|$)/.test(path))
    return { name: 'ai', limit: 'RATE_LIMIT_AI_MAX' };
  return null;
}
