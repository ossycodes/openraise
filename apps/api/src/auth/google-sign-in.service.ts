import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomToken } from '../common/tokens.js';
import type { Env } from '../config/env.js';
import type { User } from '../generated/prisma/client.js';
import { isUniqueViolation, PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';
import type { AuthResult } from './auth.types.js';
import { GoogleIdTokenVerifier, type GoogleIdentity } from './google-id-token.js';
import { hashPassword } from './password.js';

/**
 * Sign in with a Google ID token. Matches the Google account first, then a
 * user with the same (Google-verified) email, which gets linked; otherwise
 * creates a verified user. New Google users get an unusable random password
 * and can set a real one with "forgot password".
 */
@Injectable()
export class GoogleSignInService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly verifier: GoogleIdTokenVerifier,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async signIn(credential: string): Promise<AuthResult> {
    const clientId = this.config.get('GOOGLE_CLIENT_ID', { infer: true });
    if (!clientId) {
      throw new ServiceUnavailableException('Google sign-in is not set up on this deployment');
    }
    const identity = await this.verifier.verify(credential, clientId);
    return this.auth.signInAs(await this.userFor(identity));
  }

  private async userFor(id: GoogleIdentity, retried = false): Promise<User> {
    const linked = await this.prisma.user.findUnique({ where: { googleSubject: id.subject } });
    if (linked) return linked;

    const byEmail = await this.prisma.user.findUnique({ where: { email: id.email } });
    if (byEmail) {
      if (byEmail.googleSubject) {
        throw new ConflictException('This email is linked to a different Google account');
      }
      return this.prisma.user.update({
        where: { id: byEmail.id },
        data: { googleSubject: id.subject, emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date() },
      });
    }

    try {
      return await this.prisma.user.create({
        data: {
          email: id.email,
          name: id.name,
          passwordHash: await hashPassword(randomToken()),
          emailVerifiedAt: new Date(),
          googleSubject: id.subject,
        },
      });
    } catch (error) {
      // A concurrent first sign-in created the user; use it.
      if (isUniqueViolation(error) && !retried) return this.userFor(id, true);
      throw error;
    }
  }
}
