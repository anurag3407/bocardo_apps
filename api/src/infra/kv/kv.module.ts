import { Global, Logger, Module } from '@nestjs/common';
import { Redis } from '@upstash/redis';
import { ENV, type Env } from '../../config/env';
import { KV_STORE } from './kv-store';
import { MemoryKvStore } from './memory-kv-store';
import { UpstashKvStore } from './upstash-kv-store';

@Global()
@Module({
  providers: [
    {
      provide: KV_STORE,
      inject: [ENV],
      useFactory: (env: Env) => {
        if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
          return new UpstashKvStore(
            new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN }),
          );
        }
        new Logger('KvModule').warn(
          'UPSTASH_REDIS_* not set — using in-memory store (single instance only)',
        );
        return new MemoryKvStore();
      },
    },
  ],
  exports: [KV_STORE],
})
export class KvModule {}
