import { Redis } from '@upstash/redis';
import type { GeoHit, KvStore } from './kv-store';

export class UpstashKvStore implements KvStore {
  constructor(private readonly redis: Redis) {}

  get<T>(key: string): Promise<T | null> {
    return this.redis.get<T>(key);
  }

  async set(
    key: string,
    value: unknown,
    opts: { ttlSeconds?: number; onlyIfAbsent?: boolean } = {},
  ) {
    const base = opts.ttlSeconds ? { ex: opts.ttlSeconds } : {};
    const res = opts.onlyIfAbsent
      ? await this.redis.set(key, value, { ...base, nx: true } as never)
      : await this.redis.set(key, value, base as never);
    return res === 'OK';
  }

  async del(...keys: string[]) {
    if (keys.length) await this.redis.del(...keys);
  }

  async incr(key: string, ttlSeconds?: number) {
    if (!ttlSeconds) return this.redis.incr(key);
    const [count] = await this.redis
      .multi()
      .incr(key)
      .expire(key, ttlSeconds, 'NX')
      .exec<[number, number]>();
    return count;
  }

  async sadd(key: string, ...members: string[]) {
    if (members.length) await this.redis.sadd(key, members[0], ...members.slice(1));
  }

  async srem(key: string, ...members: string[]) {
    if (members.length) await this.redis.srem(key, ...members);
  }

  smembers(key: string) {
    return this.redis.smembers(key);
  }

  async sismember(key: string, member: string) {
    return (await this.redis.sismember(key, member)) === 1;
  }

  async geoAdd(key: string, member: string, lng: number, lat: number) {
    await this.redis.geoadd(key, { longitude: lng, latitude: lat, member });
  }

  async geoRemove(key: string, member: string) {
    await this.redis.zrem(key, member);
  }

  async geoSearch(
    key: string,
    lng: number,
    lat: number,
    radiusM: number,
    limit: number,
  ): Promise<GeoHit[]> {
    const hits = await this.redis.geosearch<string>(
      key,
      { type: 'FROMLONLAT', coordinate: { lon: lng, lat } },
      { type: 'BYRADIUS', radius: radiusM, radiusType: 'M' },
      'ASC',
      { count: { limit }, withDist: true },
    );
    return hits.map((h) => ({ member: String(h.member), distanceM: Number(h.dist) }));
  }
}
