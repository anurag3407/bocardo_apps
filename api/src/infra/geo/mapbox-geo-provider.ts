import { Logger } from '@nestjs/common';
import type { LatLng } from '../../common/utils/geo';
import type { GeoProvider, RouteEstimate } from './geo-provider';
import { estimate, HaversineGeoProvider } from './haversine-geo-provider';

const BASE = 'https://api.mapbox.com';
const MATRIX_MAX_COORDS = 25;
const TIMEOUT_MS = 2500;

/** Mapbox Directions + Matrix with a haversine fallback so maps outages never block ordering. */
export class MapboxGeoProvider implements GeoProvider {
  private readonly logger = new Logger(MapboxGeoProvider.name);
  private readonly fallback = new HaversineGeoProvider();

  constructor(private readonly token: string) {}

  async route(from: LatLng, to: LatLng): Promise<RouteEstimate> {
    try {
      const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
      const data = await this.get<{ routes: { distance: number; duration: number }[] }>(
        `/directions/v5/mapbox/driving-traffic/${coords}?overview=false`,
      );
      const best = data.routes[0];
      if (!best) return this.fallback.route(from, to);
      return { distanceM: Math.round(best.distance), durationS: Math.round(best.duration) };
    } catch (err) {
      this.logger.warn(`directions fallback: ${(err as Error).message}`);
      return this.fallback.route(from, to);
    }
  }

  async etaToDestination(origins: LatLng[], destination: LatLng): Promise<RouteEstimate[]> {
    if (!origins.length) return [];
    if (origins.length + 1 > MATRIX_MAX_COORDS) {
      const head = await this.etaToDestination(
        origins.slice(0, MATRIX_MAX_COORDS - 1),
        destination,
      );
      const tail = await this.etaToDestination(origins.slice(MATRIX_MAX_COORDS - 1), destination);
      return [...head, ...tail];
    }
    try {
      const coords = [...origins, destination].map((p) => `${p.lng},${p.lat}`).join(';');
      const sources = origins.map((_, i) => i).join(';');
      const data = await this.get<{
        durations: (number | null)[][];
        distances: (number | null)[][];
      }>(
        `/directions-matrix/v1/mapbox/driving/${coords}?sources=${sources}&destinations=${origins.length}&annotations=duration,distance`,
      );
      return origins.map((o, i) => {
        const durationS = data.durations[i]?.[0];
        const distanceM = data.distances[i]?.[0];
        if (durationS == null || distanceM == null) return estimate(o, destination);
        return { distanceM: Math.round(distanceM), durationS: Math.round(durationS) };
      });
    } catch (err) {
      this.logger.warn(`matrix fallback: ${(err as Error).message}`);
      return this.fallback.etaToDestination(origins, destination);
    }
  }

  private async get<T>(path: string): Promise<T> {
    const sep = path.includes('?') ? '&' : '?';
    const res = await fetch(`${BASE}${path}${sep}access_token=${this.token}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`mapbox ${res.status}`);
    return (await res.json()) as T;
  }
}
