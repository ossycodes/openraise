import { type ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from './jwt-auth.guard.js';

/**
 * Lets anonymous requests through, but when an Authorization header is
 * present it must be valid, and `request.user` is set. For pages that show
 * more to the owner (e.g. a campaign's draft) than to the public.
 */
@Injectable()
export class OptionalJwtAuthGuard extends JwtAuthGuard {
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.headers.authorization) return true;
    return super.canActivate(context);
  }
}
