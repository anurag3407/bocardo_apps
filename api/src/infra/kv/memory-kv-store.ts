import { haversineMeters } from '../../common/utils/geo';
import type { GeoHit, KvStore } from './kv-store';

interface Entry {
  value: unknown;
  expiresAt: number | null;
}

/** Single-process stand-in for Redis. Never used in production (see env validation). */
export class MemoryKvStore implements KvStore {
  private readonly data = new Map<string, Entry>();
  private readonly sets = new Map<string, Set<string>>();
  private readonly geo = new Map<string, Map<string, { lng: number; lat: number }>>();

  private live(key: string): Entry | undefined {
    const entry = this.data.get(key);
    if (entry?.expiresAt && entry.expiresAt <= Date.now()) {
      this.data.delete(key);
      return undefined;
    }
    return entry;
  }

  async get<T>(key: string) {
    const entry = this.live(key);
    return entry ? (structuredClone(entry.value) as T) : null;
  }

  async set(
    key: string,
    value: unknown,
    opts: { ttlSeconds?: number; onlyIfAbsent?: boolean } = {},
  ) {
    if (opts.onlyIfAbsent && this.live(key)) return false;
    this.data.set(key, {
      value: structuredClone(value),
      expiresAt: opts.ttlSeconds ? Date.now() + opts.ttlSeconds * 1000 : null,
    });
    return true;
  }

  async del(...keys: string[]) {
    for (const key of keys) {
      this.data.delete(key);
      this.sets.delete(key);
      this.geo.delete(key);
    }
  }

  async incr(key: string, ttlSeconds?: number) {
    const entry = this.live(key);
    const next = Number(entry?.value ?? 0) + 1;
    this.data.set(key, {
      value: next,
      expiresAt: entry?.expiresAt ?? (ttlSeconds ? Date.now() + ttlSeconds * 1000 : null),
    });
    return next;
  }

  async sadd(key: string, ...members: string[]) {
    const set = this.sets.get(key) ?? new Set<string>();
    members.forEach((m) => set.add(m));
    this.sets.set(key, set);
  }

  async srem(key: string, ...members: string[]) {
    members.forEach((m) => this.sets.get(key)?.delete(m));
  }

  async smembers(key: string) {
    return [...(this.sets.get(key) ?? [])];
  }

  async sismember(key: string, member: string) {
    return this.sets.get(key)?.has(member) ?? false;
  }

  async geoAdd(key: string, member: string, lng: number, lat: number) {
    const index = this.geo.get(key) ?? new Map();
    index.set(member, { lng, lat });
    this.geo.set(key, index);
  }

  async geoRemove(key: string, member: string) {
    this.geo.get(key)?.delete(member);
  }

  async geoSearch(
    key: string,
    lng: number,
    lat: number,
    radiusM: number,
    limit: number,
  ): Promise<GeoHit[]> {
    const index = this.geo.get(key);
    if (!index) return [];
    return [...index.entries()]
      .map(([member, p]) => ({ member, distanceM: haversineMeters({ lat, lng }, p) }))
      .filter((h) => h.distanceM <= radiusM)
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, limit);
  }
}
