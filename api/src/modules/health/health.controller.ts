import { Controller, Get, Inject, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { sql } from 'kysely';
import { Public } from '../../common/auth/decorators';
import { ENV, type Env } from '../../config/env';
import { DB, type Db } from '../../infra/database/database';
import { KV_STORE, type KvStore } from '../../infra/kv/kv-store';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(KV_STORE) private readonly kv: KvStore,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Liveness: the process is up. */
  @Public()
  @Get()
  live() {
    return { status: 'ok' };
  }

  /** Readiness: dependencies reachable (load balancers route traffic only when this passes). */
  @Public()
  @Get('ready')
  async ready(@Res({ passthrough: true }) reply: FastifyReply) {
    const [db, kv] = await Promise.allSettled([
      sql`select 1`.execute(this.db),
      this.kv.get('health:probe'),
    ]);
    // the cache is optional (we degrade without it); the database is not
    if (db.status !== 'fulfilled') void reply.status(503);
    return {
      database: db.status === 'fulfilled' ? 'ok' : 'down',
      cache: kv.status === 'fulfilled' ? 'ok' : 'degraded',
      // lets ops confirm the OTP plumbing without shell access; no secrets leave the process
      otp: {
        sender: this.env.SMS_PROVIDER,
        devWebhook: Boolean(this.env.DEV_OTP_WEBHOOK_URL),
        hookSecret: Boolean(this.env.SUPABASE_SEND_SMS_HOOK_SECRET),
      },
    };
  }
}
