import { haversineMeters, type LatLng } from '../../common/utils/geo';
import type { GeoProvider, RouteEstimate } from './geo-provider';

// Straight-line → road distance factor and average two-wheeler city speed.
const ROAD_FACTOR = 1.35;
const AVG_SPEED_MPS = 18_000 / 3600;

/** Offline estimator; also the fallback when the maps API errors or is rate-limited. */
export class HaversineGeoProvider implements GeoProvider {
  async route(from: LatLng, to: LatLng): Promise<RouteEstimate> {
    return estimate(from, to);
  }

  async etaToDestination(origins: LatLng[], destination: LatLng): Promise<RouteEstimate[]> {
    return origins.map((o) => estimate(o, destination));
  }
}

export function estimate(from: LatLng, to: LatLng): RouteEstimate {
  const distanceM = Math.round(haversineMeters(from, to) * ROAD_FACTOR);
  return { distanceM, durationS: Math.round(distanceM / AVG_SPEED_MPS) };
}
