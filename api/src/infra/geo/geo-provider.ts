import type { LatLng } from '../../common/utils/geo';

export interface RouteEstimate {
  distanceM: number;
  durationS: number;
}

/**
 * Road distance/ETA. Mapbox today; a Google implementation only needs to satisfy this
 * interface and be selected with GEO_PROVIDER=google.
 */
export interface GeoProvider {
  route(from: LatLng, to: LatLng): Promise<RouteEstimate>;
  /** Many origins → one destination (dispatch: every candidate rider → restaurant). */
  etaToDestination(origins: LatLng[], destination: LatLng): Promise<RouteEstimate[]>;
}

export const GEO_PROVIDER = Symbol('GEO_PROVIDER');
