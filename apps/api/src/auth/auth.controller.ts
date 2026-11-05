import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  emailTokenSchema,
  forgotPasswordSchema,
  refreshSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
  type SignInInput,
  type SignUpInput,
} from './auth.schemas.js';
import { AuthService } from './auth.service.js';
import type { AuthResult, AuthUser } from './auth.types.js';
import { CurrentUser } from './current-user.decorator.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('signup')
  signUp(
    @Body(new ZodValidationPipe(signUpSchema)) body: SignUpInput,
  ): Promise<AuthResult> {
    return this.auth.signUp(body);
  }

  @Post('signin')
  @HttpCode(HttpStatus.OK)
  signIn(
    @Body(new ZodValidationPipe(signInSchema)) body: SignInInput,
  ): Promise<AuthResult> {
    return this.auth.signIn(body);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(
    @Body(new ZodValidationPipe(refreshSchema)) body: { refreshToken: string },
  ): Promise<AuthResult> {
    return this.auth.refresh(body.refreshToken);
  }

  @Post('signout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async signOut(
    @Body(new ZodValidationPipe(refreshSchema)) body: { refreshToken: string },
  ): Promise<void> {
    await this.auth.signOut(body.refreshToken);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.NO_CONTENT)
  async verifyEmail(
    @Body(new ZodValidationPipe(emailTokenSchema)) body: { token: string },
  ): Promise<void> {
    await this.auth.verifyEmail(body.token);
  }

  @Post('verify-email/resend')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  async resendVerification(@CurrentUser() user: AuthUser): Promise<void> {
    await this.auth.resendVerification(user.id);
  }

  @Post('password/forgot')
  @HttpCode(HttpStatus.ACCEPTED)
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) body: { email: string },
  ): Promise<void> {
    await this.auth.forgotPassword(body.email);
  }

  @Post('password/reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema))
    body: { token: string; password: string },
  ): Promise<void> {
    await this.auth.resetPassword(body.token, body.password);
  }
}
