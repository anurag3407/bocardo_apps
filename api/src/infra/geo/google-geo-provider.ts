import { Logger } from '@nestjs/common';
import type { LatLng } from '../../common/utils/geo';
import type { GeoOrigin, GeoProvider, RouteEstimate } from './geo-provider';
import { estimate, HaversineGeoProvider } from './haversine-geo-provider';
import { CircuitBreaker, type MapsBudget } from './maps-guard';

const ROUTES_API_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const MATRIX_API_URL = 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix';
const MATRIX_MAX_ORIGINS = 25;
const TIMEOUT_MS = 2500;

interface ComputeRoutesResponse {
  routes?: Array<{
    distanceMeters?: number;
    duration?: string;
  }>;
}

interface ComputeRouteMatrixElement {
  originIndex?: number;
  destinationIndex?: number;
  status?: { code?: number; message?: string };
  condition?: string;
  distanceMeters?: number;
  duration?: string;
}

/**
 * Google Maps Routes API provider with support for TWO_WHEELER routing (essential for
 * Indian food delivery fleets) and live traffic awareness.
 * Falls back to straight-line Haversine estimation on network errors or quota limits.
 */
export class GoogleGeoProvider implements GeoProvider {
  private readonly logger = new Logger(GoogleGeoProvider.name);
  private readonly fallback = new HaversineGeoProvider();
  private readonly breaker = new CircuitBreaker();

  constructor(
    private readonly apiKey: string,
    private readonly budget?: MapsBudget,
  ) {}

  private async mayCall(elements: number): Promise<boolean> {
    if (this.breaker.open) return false;
    return this.budget ? this.budget.tryConsume('routes', elements) : true;
  }

  async route(from: LatLng, to: LatLng): Promise<RouteEstimate> {
    if (!(await this.mayCall(1))) return this.fallback.route(from, to);
    try {
      const res = await fetch(ROUTES_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
        },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
          destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
          travelMode: 'TWO_WHEELER',
          routingPreference: 'TRAFFIC_AWARE',
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!res.ok) {
        // Fall back to DRIVE if TWO_WHEELER is unavailable in the region
        if (res.status === 400) {
          return this.routeDriveFallback(from, to);
        }
        throw new Error(`google routes api HTTP ${res.status}`);
      }

      const data = (await res.json()) as ComputeRoutesResponse;
      const best = data.routes?.[0];
      // proto3 JSON omits zero values, so a zero-length route has no distanceMeters
      if (!best?.duration) {
        return this.fallback.route(from, to);
      }

      this.breaker.success();
      return {
        distanceM: Math.round(best.distanceMeters ?? 0),
        durationS: parseProtobufDuration(best.duration),
      };
    } catch (err) {
      this.breaker.failure();
      this.logger.warn(`google route fallback: ${(err as Error).message}`);
      return this.fallback.route(from, to);
    }
  }

  async etaToDestination(origins: GeoOrigin[], destination: LatLng): Promise<RouteEstimate[]> {
    if (!origins.length) return [];

    if (origins.length > MATRIX_MAX_ORIGINS) {
      const head = await this.etaToDestination(origins.slice(0, MATRIX_MAX_ORIGINS), destination);
      const tail = await this.etaToDestination(origins.slice(MATRIX_MAX_ORIGINS), destination);
      return [...head, ...tail];
    }

    if (!(await this.mayCall(origins.length))) {
      return this.fallback.etaToDestination(origins, destination);
    }

    try {
      const res = await fetch(MATRIX_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask':
            'originIndex,destinationIndex,status,condition,distanceMeters,duration',
        },
        body: JSON.stringify({
          origins: origins.map((o) => ({
            waypoint: {
              location: {
                latLng: { latitude: o.lat, longitude: o.lng },
                ...(o.heading != null ? { heading: Math.round(o.heading) % 360 } : {}),
              },
            },
          })),
          destinations: [
            {
              waypoint: {
                location: { latLng: { latitude: destination.lat, longitude: destination.lng } },
              },
            },
          ],
          travelMode: 'TWO_WHEELER',
          routingPreference: 'TRAFFIC_AWARE',
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!res.ok) throw new Error(`google route matrix HTTP ${res.status}`);

      const elements = (await res.json()) as ComputeRouteMatrixElement[];
      this.breaker.success();
      const resultMap = new Map<number, RouteEstimate>();

      for (const el of elements) {
        if (el.originIndex != null && el.duration && !el.status?.code) {
          resultMap.set(el.originIndex, {
            distanceM: Math.round(el.distanceMeters ?? 0),
            durationS: parseProtobufDuration(el.duration),
          });
        }
      }

      return origins.map((o, idx) => {
        const found = resultMap.get(idx);
        return found ?? estimate(o, destination);
      });
    } catch (err) {
      this.breaker.failure();
      this.logger.warn(`google matrix fallback: ${(err as Error).message}`);
      return this.fallback.etaToDestination(origins, destination);
    }
  }

  private async routeDriveFallback(from: LatLng, to: LatLng): Promise<RouteEstimate> {
    try {
      const res = await fetch(ROUTES_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
        },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
          destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
          travelMode: 'DRIVE',
          routingPreference: 'TRAFFIC_AWARE',
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!res.ok) throw new Error(`google routes drive fallback HTTP ${res.status}`);
      const data = (await res.json()) as ComputeRoutesResponse;
      const best = data.routes?.[0];
      if (!best?.duration) {
        return this.fallback.route(from, to);
      }
      this.breaker.success();
      return {
        distanceM: Math.round(best.distanceMeters ?? 0),
        durationS: parseProtobufDuration(best.duration),
      };
    } catch (err) {
      // a rejected API key also surfaces as HTTP 400, so this path must be visible
      this.breaker.failure();
      this.logger.warn(`google drive fallback: ${(err as Error).message}`);
      return this.fallback.route(from, to);
    }
  }
}

/**
 * Parses Protobuf duration strings like "540s" or "32.5s" into integer seconds.
 */
export function parseProtobufDuration(durationStr: string): number {
  if (typeof durationStr !== 'string') return 0;
  const num = parseFloat(durationStr.replace('s', ''));
  return isNaN(num) ? 0 : Math.round(num);
}
