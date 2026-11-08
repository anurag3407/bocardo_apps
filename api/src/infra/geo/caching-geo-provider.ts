import { encodeGeohash, type LatLng } from '../../common/utils/geo';
import type { KvStore } from '../kv/kv-store';
import type { GeoOrigin, GeoProvider, RouteEstimate } from './geo-provider';

/** Long enough to cover cart edits through checkout, short enough to follow traffic. */
const ROUTE_TTL_S = 30 * 60;
/** Dispatch retries every few seconds; a rider rarely leaves a ~150m cell inside this window. */
const ETA_TTL_S = 3 * 60;

const cell = (p: LatLng, precision: number) => encodeGeohash(p, precision);

/**
 * Sits in front of any paid provider. Coordinates are quantised so nearby points share an
 * entry, concurrent identical lookups share one call, and straight-line estimates are never
 * cached, so a brief outage cannot pin bad numbers in place.
 */
export class CachingGeoProvider implements GeoProvider {
  private readonly inflight = new Map<string, Promise<RouteEstimate>>();

  constructor(
    private readonly inner: GeoProvider,
    private readonly kv: KvStore,
  ) {}

  async route(from: LatLng, to: LatLng): Promise<RouteEstimate> {
    const key = `geo:route:${cell(from, 8)}:${cell(to, 8)}`;
    const cached = await this.kv.get<RouteEstimate>(key).catch(() => null);
    if (cached) return cached;

    const pending = this.inflight.get(key);
    if (pending) return pending;

    const lookup = this.inner
      .route(from, to)
      .then(async (result) => {
        await this.store(key, result, ROUTE_TTL_S);
        return result;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, lookup);
    return lookup;
  }

  async etaToDestination(origins: GeoOrigin[], destination: LatLng): Promise<RouteEstimate[]> {
    const target = cell(destination, 8);
    const keys = origins.map((o) => `geo:eta:${cell(o, 7)}:${target}`);
    const results = await Promise.all(
      keys.map((k) => this.kv.get<RouteEstimate>(k).catch(() => null)),
    );

    const missing = results.flatMap((r, i) => (r ? [] : [i]));
    if (missing.length) {
      const fresh = await this.inner.etaToDestination(
        missing.map((i) => origins[i]),
        destination,
      );
      await Promise.all(
        missing.map((originIdx, i) => {
          results[originIdx] = fresh[i];
          return this.store(keys[originIdx], fresh[i], ETA_TTL_S);
        }),
      );
    }
    return results as RouteEstimate[];
  }

  private async store(key: string, value: RouteEstimate, ttlSeconds: number) {
    if (value.estimated) return;
    await this.kv.set(key, value, { ttlSeconds }).catch(() => undefined);
  }
}
