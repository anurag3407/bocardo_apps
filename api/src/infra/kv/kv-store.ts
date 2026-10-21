export interface GeoHit {
  member: string;
  distanceM: number;
}

/**
 * The subset of Redis Bocardo relies on. Production uses Upstash; tests and
 * credential-less local dev use the in-memory implementation.
 */
export interface KvStore {
  get<T>(key: string): Promise<T | null>;
  /** Returns false when `onlyIfAbsent` is set and the key already exists. */
  set(
    key: string,
    value: unknown,
    opts?: { ttlSeconds?: number; onlyIfAbsent?: boolean },
  ): Promise<boolean>;
  del(...keys: string[]): Promise<void>;
  /** Increments and, on the first increment, sets the TTL (fixed-window counters). */
  incr(key: string, ttlSeconds?: number): Promise<number>;

  sadd(key: string, ...members: string[]): Promise<void>;
  srem(key: string, ...members: string[]): Promise<void>;
  smembers(key: string): Promise<string[]>;
  sismember(key: string, member: string): Promise<boolean>;

  geoAdd(key: string, member: string, lng: number, lat: number): Promise<void>;
  geoRemove(key: string, member: string): Promise<void>;
  /** Nearest-first members within radius. */
  geoSearch(
    key: string,
    lng: number,
    lat: number,
    radiusM: number,
    limit: number,
  ): Promise<GeoHit[]>;
}

export const KV_STORE = Symbol('KV_STORE');
