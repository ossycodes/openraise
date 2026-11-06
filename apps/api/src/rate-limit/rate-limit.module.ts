import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { RateLimitGuard } from './rate-limit.guard.js';
import { RateLimitStore } from './rate-limit.store.js';
@Module({
  providers: [
    RateLimitStore,
    RateLimitGuard,
    { provide: APP_GUARD, useExisting: RateLimitGuard },
  ],
  exports: [RateLimitStore, RateLimitGuard],
})
export class RateLimitModule {}
