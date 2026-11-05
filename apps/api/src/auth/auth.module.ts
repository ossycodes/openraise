import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { Env } from '../config/env.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { GoogleIdTokenVerifier, googleJwksProvider } from './google-id-token.js';
import { GoogleSignInService } from './google-sign-in.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

/** Global so any module can put JwtAuthGuard on its routes. */
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_SECRET'),
        signOptions: {
          expiresIn: config.get('JWT_ACCESS_TTL'),
          issuer: 'openraise',
        },
        verifyOptions: { issuer: 'openraise' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtAuthGuard,
    googleJwksProvider,
    GoogleIdTokenVerifier,
    GoogleSignInService,
  ],
  exports: [JwtModule, JwtAuthGuard],
})
export class AuthModule {}
