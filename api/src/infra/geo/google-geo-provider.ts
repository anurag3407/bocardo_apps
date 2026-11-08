import { Logger } from '@nestjs/common';
import type { LatLng } from '../../common/utils/geo';
import type { GeoProvider, RouteEstimate } from './geo-provider';
import { estimate, HaversineGeoProvider } from './haversine-geo-provider';

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

  constructor(private readonly apiKey: string) {}

  async route(from: LatLng, to: LatLng): Promise<RouteEstimate> {
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
      if (!best || best.distanceMeters == null || !best.duration) {
        return this.fallback.route(from, to);
      }

      return {
        distanceM: Math.round(best.distanceMeters),
        durationS: parseProtobufDuration(best.duration),
      };
    } catch (err) {
      this.logger.warn(`google route fallback: ${(err as Error).message}`);
      return this.fallback.route(from, to);
    }
  }

  async etaToDestination(origins: LatLng[], destination: LatLng): Promise<RouteEstimate[]> {
    if (!origins.length) return [];

    if (origins.length > MATRIX_MAX_ORIGINS) {
      const head = await this.etaToDestination(
        origins.slice(0, MATRIX_MAX_ORIGINS),
        destination,
      );
      const tail = await this.etaToDestination(origins.slice(MATRIX_MAX_ORIGINS), destination);
      return [...head, ...tail];
    }

    try {
      const res = await fetch(MATRIX_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': 'originIndex,destinationIndex,status,condition,distanceMeters,duration',
        },
        body: JSON.stringify({
          origins: origins.map((o) => ({
            waypoint: { location: { latLng: { latitude: o.lat, longitude: o.lng } } },
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
      const resultMap = new Map<number, RouteEstimate>();

      for (const el of elements) {
        if (el.originIndex != null && el.distanceMeters != null && el.duration) {
          resultMap.set(el.originIndex, {
            distanceM: Math.round(el.distanceMeters),
            durationS: parseProtobufDuration(el.duration),
          });
        }
      }

      return origins.map((o, idx) => {
        const found = resultMap.get(idx);
        return found ?? estimate(o, destination);
      });
    } catch (err) {
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
      if (!best || best.distanceMeters == null || !best.duration) {
        return this.fallback.route(from, to);
      }
      return {
        distanceM: Math.round(best.distanceMeters),
        durationS: parseProtobufDuration(best.duration),
      };
    } catch {
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
