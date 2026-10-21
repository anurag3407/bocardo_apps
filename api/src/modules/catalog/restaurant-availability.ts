import { isWithinOpeningHours, type OpeningSlot } from '../../common/utils/opening-hours';
import type { RestaurantStatus } from '../../infra/database/db.types';

export type ClosedReason = 'INACTIVE' | 'PAUSED' | 'BUSY' | 'OUTSIDE_HOURS';

export interface Availability {
  isOpen: boolean;
  closedReason: ClosedReason | null;
}

/** Restaurant takes orders only when active, switched on, not in busy mode, and inside its hours. */
export function restaurantAvailability(
  r: { status: RestaurantStatus; is_open: boolean; busy_until: Date | null },
  hours: OpeningSlot[],
  now: Date,
  timeZone: string,
): Availability {
  if (r.status !== 'active') return { isOpen: false, closedReason: 'INACTIVE' };
  if (!r.is_open) return { isOpen: false, closedReason: 'PAUSED' };
  if (r.busy_until && r.busy_until > now) return { isOpen: false, closedReason: 'BUSY' };
  if (!isWithinOpeningHours(hours, now, timeZone))
    return { isOpen: false, closedReason: 'OUTSIDE_HOURS' };
  return { isOpen: true, closedReason: null };
}

const AVG_SPEED_MPS = 5;
const ROAD_FACTOR = 1.35;
const HANDOFF_BUFFER_MIN = 5;

/** Listing-level ETA: prep + travel + buffer, rounded up to 5 minutes. */
export function estimateDeliveryMinutes(prepMinutes: number, distanceM: number): number {
  const travel = (distanceM * ROAD_FACTOR) / AVG_SPEED_MPS / 60;
  return Math.ceil((prepMinutes + travel + HANDOFF_BUFFER_MIN) / 5) * 5;
}
