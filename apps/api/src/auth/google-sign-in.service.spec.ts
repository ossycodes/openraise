import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { validateEnv } from '../config/env.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { AuthService } from './auth.service.js';
import type { GoogleIdTokenVerifier } from './google-id-token.js';
import { GoogleSignInService } from './google-sign-in.service.js';

describe('GoogleSignInService', () => {
  it('answers 503 when the deployment has no Google client ID', async () => {
    const verify = vi.fn();
    const service = new GoogleSignInService(
      {} as PrismaService,
      {} as AuthService,
      { verify } as unknown as GoogleIdTokenVerifier,
      { get: () => undefined } as unknown as ConfigService<Env, true>,
    );
    await expect(service.signIn('x'.repeat(40))).rejects.toThrow(ServiceUnavailableException);
    expect(verify).not.toHaveBeenCalled();
  });

  it('treats an empty GOOGLE_CLIENT_ID placeholder as unset', () => {
    const env = validateEnv({
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
      JWT_SECRET: 'x'.repeat(32),
      GOOGLE_CLIENT_ID: '',
    });
    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
  });
});
