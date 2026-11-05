import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { Env } from '../config/env.js';
import { randomToken, sha256 } from '../common/tokens.js';
import {
  EmailTokenPurpose,
  type User,
} from '../generated/prisma/client.js';
import { MailService } from '../mail/mail.service.js';
import { resetPasswordEmail, verifyEmailEmail } from '../mail/templates.js';
import { isUniqueViolation, PrismaService } from '../prisma/prisma.service.js';
import type { SignInInput, SignUpInput } from './auth.schemas.js';
import {
  toPublicUser,
  type AccessTokenPayload,
  type AuthResult,
} from './auth.types.js';
import { hashPassword, verifyPassword } from './password.js';

const VERIFY_EMAIL_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_PASSWORD_TTL_MS = 60 * 60 * 1000;
const INVALID_LINK = 'This link is invalid or has expired';
const BAD_CREDENTIALS = 'Email or password is incorrect';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  /** Verified against when the email is unknown, so timing doesn't reveal it. */
  private readonly dummyHash = hashPassword(randomToken());

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async signUp(input: SignUpInput): Promise<AuthResult> {
    const passwordHash = await hashPassword(input.password);
    let user: User;
    try {
      user = await this.prisma.user.create({
        data: { email: input.email, name: input.name, passwordHash },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('An account with this email already exists');
      }
      throw error;
    }
    await this.sendVerificationEmail(user);
    return this.issueTokens(user, randomUUID());
  }

  async signIn(input: SignInInput): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
    });
    const ok = await verifyPassword(
      input.password,
      user?.passwordHash ?? (await this.dummyHash),
    );
    if (!user || !ok) throw new UnauthorizedException(BAD_CREDENTIALS);
    return this.issueTokens(user, randomUUID());
  }

  /**
   * Swap a refresh token for a new pair. Each token works once; presenting a
   * spent token means it was stolen or replayed, so the whole family (every
   * token from that sign-in) is revoked.
   */
  async refresh(refreshToken: string): Promise<AuthResult> {
    const now = new Date();
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      include: { user: true },
    });
    if (!existing || existing.expiresAt <= now) {
      throw new UnauthorizedException('Sign in again');
    }
    if (existing.revokedAt) {
      await this.revokeFamily(existing.familyId);
      throw new UnauthorizedException('Sign in again');
    }
    // Claim it atomically so two concurrent refreshes can't both succeed.
    const claimed = await this.prisma.refreshToken.updateMany({
      where: { id: existing.id, revokedAt: null },
      data: { revokedAt: now },
    });
    if (claimed.count === 0) {
      await this.revokeFamily(existing.familyId);
      throw new UnauthorizedException('Sign in again');
    }
    return this.issueTokens(existing.user, existing.familyId);
  }

  /** Revoke every token from the sign-in this refresh token belongs to. */
  async signOut(refreshToken: string): Promise<void> {
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      select: { familyId: true },
    });
    if (existing) await this.revokeFamily(existing.familyId);
  }

  async verifyEmail(token: string): Promise<void> {
    const userId = await this.consumeEmailToken(
      token,
      EmailTokenPurpose.VERIFY_EMAIL,
    );
    await this.prisma.user.updateMany({
      where: { id: userId, emailVerifiedAt: null },
      data: { emailVerifiedAt: new Date() },
    });
  }

  async resendVerification(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user && !user.emailVerifiedAt) await this.sendVerificationEmail(user);
  }

  /** Always succeeds, so the response can't reveal which emails have accounts. */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return;
    const token = await this.createEmailToken(
      user.id,
      EmailTokenPurpose.RESET_PASSWORD,
      RESET_PASSWORD_TTL_MS,
    );
    // Not awaited: a slow SMTP server must not make known emails measurably slower.
    this.mail
      .send(resetPasswordEmail(user.name, user.email, this.link('/reset-password', token)))
      .catch((error: unknown) =>
        this.logger.error(`Password reset email failed: ${String(error)}`),
      );
  }

  /** Set a new password and sign out every device. */
  async resetPassword(token: string, password: string): Promise<void> {
    const userId = await this.consumeEmailToken(
      token,
      EmailTokenPurpose.RESET_PASSWORD,
    );
    const passwordHash = await hashPassword(password);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash, tokenVersion: { increment: 1 } },
      }),
      // Following the emailed link proves they own the address.
      this.prisma.user.updateMany({
        where: { id: userId, emailVerifiedAt: null },
        data: { emailVerifiedAt: now },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);
  }

  private async issueTokens(user: User, familyId: string): Promise<AuthResult> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      role: user.role,
      tv: user.tokenVersion,
    };
    const accessToken = await this.jwt.signAsync(payload);
    const refreshToken = randomToken();
    const ttlDays = this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true });
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(refreshToken),
        familyId,
        expiresAt: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000),
      },
    });
    return {
      user: toPublicUser(user),
      accessToken,
      expiresIn: this.config.get('JWT_ACCESS_TTL', { infer: true }),
      refreshToken,
    };
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async sendVerificationEmail(user: User): Promise<void> {
    const token = await this.createEmailToken(
      user.id,
      EmailTokenPurpose.VERIFY_EMAIL,
      VERIFY_EMAIL_TTL_MS,
    );
    await this.mail.send(
      verifyEmailEmail(user.name, user.email, this.link('/verify-email', token)),
    );
  }

  /** A new link replaces any unused older link for the same purpose. */
  private async createEmailToken(
    userId: string,
    purpose: EmailTokenPurpose,
    ttlMs: number,
  ): Promise<string> {
    const token = randomToken();
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.emailToken.updateMany({
        where: { userId, purpose, usedAt: null },
        data: { usedAt: now },
      }),
      this.prisma.emailToken.create({
        data: {
          userId,
          purpose,
          tokenHash: sha256(token),
          expiresAt: new Date(now.getTime() + ttlMs),
        },
      }),
    ]);
    return token;
  }

  /** Single use: claimed with a conditional update so a link can't be used twice. */
  private async consumeEmailToken(
    token: string,
    purpose: EmailTokenPurpose,
  ): Promise<string> {
    const now = new Date();
    const row = await this.prisma.emailToken.findUnique({
      where: { tokenHash: sha256(token) },
    });
    if (!row || row.purpose !== purpose || row.usedAt || row.expiresAt <= now) {
      throw new BadRequestException(INVALID_LINK);
    }
    const claimed = await this.prisma.emailToken.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: now },
    });
    if (claimed.count === 0) throw new BadRequestException(INVALID_LINK);
    return row.userId;
  }

  private link(path: string, token: string): string {
    const url = new URL(path, this.config.get('WEB_URL', { infer: true }));
    url.searchParams.set('token', token);
    return url.toString();
  }
}
