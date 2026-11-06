import {
  Injectable,
  Logger,
  HttpException,
  ServiceUnavailableException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHmac } from 'node:crypto';
import type { Request, Response } from 'express';
import type { Env } from '../config/env.js';
import {
  clientAddress,
  networkIdentity,
  trustedProxies,
} from './client-address.js';
import { policyFor } from './policies.js';
import { RateLimitStore } from './rate-limit.store.js';
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);
  private lastUnavailableAt = 0;
  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly store: RateLimitStore,
    private readonly jwt: JwtService,
  ) {}
  async canActivate(context: ExecutionContext) {
    if (!this.config.get('RATE_LIMIT_ENABLED')) return true;
    const req = context.switchToHttp().getRequest<Request>(),
      res = context.switchToHttp().getResponse<Response>();
    const policy = policyFor(
      req.method,
      req.path.replace(/\/+$/, '').toLowerCase(),
    );
    if (!policy) return true;
    const address = clientAddress(
      req,
      trustedProxies(this.config.get('RATE_LIMIT_TRUSTED_PROXIES')),
      this.config.get('RATE_LIMIT_RELAY_SECRET'),
    );
    const identities = [`network:${networkIdentity(address)}`];
    const token = req.get('authorization');
    if (token?.startsWith('Bearer ')) {
      try {
        const claims = await this.jwt.verifyAsync<{ sub?: string }>(
          token.slice(7),
        );
        if (typeof claims.sub === 'string' && claims.sub.length <= 100)
          identities.push(`account:${claims.sub}`);
      } catch {
        /* Invalid tokens still consume the network allowance; auth guards reject them. */
      }
    }
    if (
      policy.email &&
      typeof req.body?.email === 'string' &&
      req.body.email.length <= 254
    )
      identities.push(`email:${req.body.email.trim().toLowerCase()}`);
    const keys = identities.map(
      (identity) =>
        `${this.config.get('RATE_LIMIT_PREFIX')}:${policy.name}:${createHmac('sha256', this.config.get('JWT_SECRET')).update(`rate-limit:v1:${identity}`).digest('hex')}`,
    );
    let result;
    try {
      result = await this.store.consume(
        keys,
        Number(this.config.get(policy.limit)),
        this.config.get('RATE_LIMIT_WINDOW_SECONDS') * 1000,
      );
    } catch {
      if (Date.now() - this.lastUnavailableAt > 30000) {
        this.lastUnavailableAt = Date.now();
        this.logger.error(
          'Rate limiter unavailable; protected requests temporarily blocked',
        );
      }
      res.setHeader('Retry-After', '5');
      res.setHeader('Cache-Control', 'no-store');
      throw new ServiceUnavailableException({
        code: 'RATE_LIMIT_UNAVAILABLE',
        message: 'This request is temporarily unavailable. Try again shortly.',
        retryAfterSeconds: 5,
      });
    }
    if (!result.allowed) {
      res.setHeader('Retry-After', String(result.retryAfter));
      res.setHeader('Cache-Control', 'no-store');
      throw new HttpException(
        {
          code: 'RATE_LIMITED',
          message: `Too many requests. Try again in ${result.retryAfter} seconds.`,
          retryAfterSeconds: result.retryAfter,
        },
        429,
      );
    }
    return true;
  }
}
