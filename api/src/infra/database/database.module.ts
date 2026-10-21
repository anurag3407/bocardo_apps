import { Global, Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool, types } from 'pg';
import { ENV, type Env } from '../../config/env';
import { DB, type Db } from './database';
import type { Database } from './db.types';

// int8 (count(*), sums) → number. Values stay far below 2^53 at our scale.
types.setTypeParser(20, (v) => Number(v));

@Global()
@Module({
  providers: [
    {
      provide: DB,
      inject: [ENV],
      useFactory: (env: Env): Db =>
        new Kysely<Database>({
          dialect: new PostgresDialect({
            pool: new Pool({
              connectionString: env.DATABASE_URL,
              max: env.DATABASE_POOL_MAX,
              idleTimeoutMillis: 30_000,
            }),
          }),
        }),
    },
  ],
  exports: [DB],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(@Inject(DB) private readonly db: Db) {}

  async onModuleDestroy() {
    await this.db.destroy();
  }
}
