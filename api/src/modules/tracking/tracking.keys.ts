/** Redis key layout for live rider state. Shared by dispatch, riders, orders and admin. */
export const trackingKeys = {
  /** GEO set of online riders per city (member = riderId). */
  ridersGeo: (cityId: string) => `riders:geo:${cityId}`,
  /** Set of online riders with no active order, per city. */
  idleRiders: (cityId: string) => `riders:idle:${cityId}`,
  /** Last accepted position: LiveLocation JSON. */
  riderLocation: (riderId: string) => `rider:loc:${riderId}`,
  /** Throttle flag for persisting breadcrumbs to Postgres. */
  riderPersistGate: (riderId: string) => `rider:persist:${riderId}`,
  /** When the rider last became idle (for fair dispatch). */
  riderIdleSince: (riderId: string) => `rider:idle-since:${riderId}`,
};

export interface LiveLocation {
  lat: number;
  lng: number;
  heading: number | null;
  speedMps: number | null;
  at: string;
}

/** A rider whose last ping is older than this is not offered new orders. */
export const LOCATION_FRESH_MS = 2 * 60 * 1000;
