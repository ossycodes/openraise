import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

/** Google's signing keys. Overridden in tests with a local key set. */
export const GOOGLE_JWKS = Symbol('GOOGLE_JWKS');
export const googleJwksProvider = {
  provide: GOOGLE_JWKS,
  useFactory: (): JWTVerifyGetKey =>
    createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs')),
};

export interface GoogleIdentity {
  subject: string;
  email: string;
  name: string;
}

const REJECTED = 'Google sign-in failed';

/**
 * Verifies a Google ID token (the "credential" One Tap and the Sign in with
 * Google button return): RS256 signature against Google's published keys,
 * issuer, our client ID as audience, expiry, and a verified email.
 */
@Injectable()
export class GoogleIdTokenVerifier {
  constructor(@Inject(GOOGLE_JWKS) private readonly jwks: JWTVerifyGetKey) {}

  async verify(credential: string, clientId: string): Promise<GoogleIdentity> {
    let payload;
    try {
      ({ payload } = await jwtVerify(credential, this.jwks, {
        issuer: ['https://accounts.google.com', 'accounts.google.com'],
        audience: clientId,
        algorithms: ['RS256'],
      }));
    } catch {
      throw new UnauthorizedException(REJECTED);
    }
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.email !== 'string' ||
      payload.email_verified !== true
    ) {
      throw new UnauthorizedException(REJECTED);
    }
    const email = payload.email.trim().toLowerCase();
    const name =
      typeof payload.name === 'string' && payload.name.trim()
        ? payload.name.trim().slice(0, 100)
        : email.split('@')[0]!;
    return { subject: payload.sub, email, name };
  }
}
