import { Controller, Get, Inject, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { sql } from 'kysely';
import { Public } from '../../common/auth/decorators';
import { DB, type Db } from '../../infra/database/database';
import { KV_STORE, type KvStore } from '../../infra/kv/kv-store';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(KV_STORE) private readonly kv: KvStore,
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
    };
  }
}
