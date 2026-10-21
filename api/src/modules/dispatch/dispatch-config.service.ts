import { Inject, Injectable } from '@nestjs/common';
import { DB, type Db } from '../../infra/database/database';

export interface DispatchConfig {
  offerTimeoutSeconds: number;
  /** Search radius per attempt; the last value repeats. */
  radiiMeters: number[];
  maxAttempts: number;
  retryDelaySeconds: number;
}

const DEFAULTS: DispatchConfig = {
  offerTimeoutSeconds: 30,
  radiiMeters: [3000, 5000, 8000],
  maxAttempts: 8,
  retryDelaySeconds: 30,
};
const CACHE_MS = 60_000;

/** Dispatch tuning lives in app_config so ops can change it without a deploy. */
@Injectable()
export class DispatchConfigService {
  private cached: { value: DispatchConfig; at: number } | null = null;

  constructor(@Inject(DB) private readonly db: Db) {}

  async get(): Promise<DispatchConfig> {
    if (this.cached && Date.now() - this.cached.at < CACHE_MS) return this.cached.value;
    const row = await this.db
      .selectFrom('app_config')
      .select('value')
      .where('key', '=', 'dispatch')
      .executeTakeFirst();
    const value = { ...DEFAULTS, ...((row?.value as Partial<DispatchConfig>) ?? {}) };
    this.cached = { value, at: Date.now() };
    return value;
  }
}
