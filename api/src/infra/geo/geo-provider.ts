import type { LatLng } from '../../common/utils/geo';

export interface RouteEstimate {
  distanceM: number;
  durationS: number;
  /** True when this is a straight-line guess rather than a real road route. */
  estimated?: boolean;
}

/** A route start; `heading` (degrees) places a moving rider on the correct side of the road. */
export type GeoOrigin = LatLng & { heading?: number | null };

/** Road distance/ETA. The adapter is selected with GEO_PROVIDER. */
export interface GeoProvider {
  route(from: LatLng, to: LatLng): Promise<RouteEstimate>;
  /** Many origins → one destination (dispatch: every candidate rider → restaurant). */
  etaToDestination(origins: GeoOrigin[], destination: LatLng): Promise<RouteEstimate[]>;
}

export const GEO_PROVIDER = Symbol('GEO_PROVIDER');
