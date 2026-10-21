import { Inject, Injectable, Logger } from '@nestjs/common';
import { KV_STORE, type KvStore } from '../../infra/kv/kv-store';

/**
 * Read-through cache helper. Cache failures degrade to a direct load —
 * a Redis outage slows the catalogue down but never takes it offline.
 */
@Injectable()
export class CatalogCache {
  private readonly logger = new Logger(CatalogCache.name);

  constructor(@Inject(KV_STORE) private readonly kv: KvStore) {}

  async getOrLoad<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
    try {
      const hit = await this.kv.get<T>(key);
      if (hit !== null) return hit;
    } catch (err) {
      this.logger.warn(`cache read failed for ${key}: ${(err as Error).message}`);
    }
    const value = await load();
    this.kv.set(key, value, { ttlSeconds }).catch(() => undefined);
    return value;
  }

  async invalidateMenu(restaurantId: string) {
    await this.kv.del(menuKey(restaurantId)).catch(() => undefined);
  }
}

export const menuKey = (restaurantId: string) => `menu:${restaurantId}`;
export const nearbyKey = (geohash: string) => `nearby:${geohash}`;
