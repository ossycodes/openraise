import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { Env } from '../config/env.js';
// Check every bucket before incrementing any. Denied requests never extend expiry.
const script = `local retry=0
for i,key in ipairs(KEYS) do
 local count=tonumber(redis.call('GET',key) or '0')
 if count>=tonumber(ARGV[1]) then local ttl=redis.call('PTTL',key) if ttl<0 then redis.call('PEXPIRE',key,ARGV[2]) ttl=tonumber(ARGV[2]) end retry=math.max(retry,ttl) end
end
if retry>0 then return {0,retry} end
for i,key in ipairs(KEYS) do local count=redis.call('INCR',key) if count==1 then redis.call('PEXPIRE',key,ARGV[2]) end end
return {1,0}`;
@Injectable()
export class RateLimitStore implements OnModuleDestroy {
  private redis?: Redis;
  private connection?: Promise<void>;
  constructor(private readonly config: ConfigService<Env, true>) {}
  private client() {
    if (!this.redis) {
      this.redis = new Redis(this.config.get('REDIS_URL'), {
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        connectTimeout: 1000,
        commandTimeout: 1000,
        lazyConnect: true,
        autoResendUnfulfilledCommands: false,
      });
      this.redis.on('error', () => {});
    }
    return this.redis;
  }
  async consume(keys: string[], limit: number, windowMs: number) {
    const client = this.client();
    if (client.status === 'wait')
      this.connection ??= client.connect().finally(() => {
        this.connection = undefined;
      });
    if (this.connection) await this.connection;
    const value = (await client.eval(
      script,
      keys.length,
      ...keys,
      limit,
      windowMs,
    )) as [number, number];
    return {
      allowed: value[0] === 1,
      retryAfter: Math.max(1, Math.ceil(value[1] / 1000)),
    };
  }
  async onModuleDestroy() {
    this.redis?.disconnect();
  }
}
