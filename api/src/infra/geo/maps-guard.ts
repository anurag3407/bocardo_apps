import { Logger } from '@nestjs/common';
import type { KvStore } from '../kv/kv-store';

/** Stops calling a failing upstream for a cooldown, so an outage costs no latency per request. */
export class CircuitBreaker {
  private failures = 0;
  private openUntil = 0;

  constructor(
    private readonly threshold = 5,
    private readonly cooldownMs = 30_000,
  ) {}

  get open(): boolean {
    return Date.now() < this.openUntil;
  }

  success(): void {
    this.failures = 0;
  }

  failure(): void {
    if (++this.failures >= this.threshold) {
      this.openUntil = Date.now() + this.cooldownMs;
      this.failures = 0;
    }
  }
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Hard daily cap on billable map events, shared by every API instance through Redis. */
export class MapsBudget {
  private readonly logger = new Logger(MapsBudget.name);

  constructor(
    private readonly kv: KvStore,
    private readonly dailyLimit: number,
  ) {}

  /** Fails open when Redis is down: losing the cap for a while beats losing maps. */
  async tryConsume(bucket: string, units = 1): Promise<boolean> {
    const day = new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
    const key = `maps:budget:${bucket}:${day}`;
    try {
      const counts = await Promise.all(
        Array.from({ length: units }, () => this.kv.incr(key, 2 * 86_400)),
      );
      const used = Math.max(...counts);
      if (used <= this.dailyLimit) return true;
      if (used - units < this.dailyLimit)
        this.logger.error(`daily maps budget exhausted for ${bucket} (${this.dailyLimit})`);
      return false;
    } catch {
      return true;
    }
  }
}
