import { Inject, Injectable, Logger } from '@nestjs/common';
import { DB, type Db } from '../../infra/database/database';

const CACHE_MS = 60_000;

/** Typed access to `app_config` rows (ops-tunable without a deploy), cached for a minute. */
@Injectable()
export class AppConfigService {
  private readonly logger = new Logger(AppConfigService.name);
  private readonly cache = new Map<string, { value: unknown; at: number }>();

  constructor(@Inject(DB) private readonly db: Db) {}

  async get<T extends object>(key: string, defaults: T): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as T;
    let stored: Partial<T> = {};
    try {
      const row = await this.db
        .selectFrom('app_config')
        .select('value')
        .where('key', '=', key)
        .executeTakeFirst();
      stored = (row?.value as Partial<T>) ?? {};
    } catch (err) {
      // remote config must never take a request down: serve the last known value or defaults
      this.logger.warn(`app_config "${key}" unavailable: ${(err as Error).message}`);
      if (hit) return hit.value as T;
    }
    const value = { ...defaults, ...stored };
    this.cache.set(key, { value, at: Date.now() });
    return value;
  }
}
