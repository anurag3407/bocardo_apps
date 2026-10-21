export interface DispatchCandidate {
  riderId: string;
  /** Road ETA from the rider's live position to the restaurant. */
  etaToRestaurantS: number;
  distanceToRestaurantM: number;
  idleSeconds: number;
  acceptanceRate: number;
  ratingAvg: number;
  ratingCount: number;
}

export interface ScoredCandidate extends DispatchCandidate {
  score: number;
}

const WEIGHTS = { eta: 0.55, acceptance: 0.2, idle: 0.15, rating: 0.1 } as const;
const ETA_CAP_S = 30 * 60;
const IDLE_CAP_S = 30 * 60;
const NEW_RIDER_RATING = 0.8;

/**
 * Score in [0, 1]. Closeness dominates (food waits for nobody); acceptance rate penalises
 * riders who ignore offers; idle time spreads work fairly; rating breaks ties.
 */
export function scoreCandidate(c: DispatchCandidate): number {
  const eta = 1 - Math.min(c.etaToRestaurantS, ETA_CAP_S) / ETA_CAP_S;
  const idle = Math.min(Math.max(c.idleSeconds, 0), IDLE_CAP_S) / IDLE_CAP_S;
  const acceptance = Math.min(Math.max(c.acceptanceRate, 0), 1);
  const rating = c.ratingCount < 5 ? NEW_RIDER_RATING : Math.min(c.ratingAvg, 5) / 5;
  const score =
    WEIGHTS.eta * eta +
    WEIGHTS.acceptance * acceptance +
    WEIGHTS.idle * idle +
    WEIGHTS.rating * rating;
  return Math.round(score * 10_000) / 10_000;
}

export function rankCandidates(candidates: DispatchCandidate[]): ScoredCandidate[] {
  return candidates
    .map((c) => ({ ...c, score: scoreCandidate(c) }))
    .sort((a, b) => b.score - a.score || a.etaToRestaurantS - b.etaToRestaurantS);
}

export const RIDER_PAY = {
  basePaise: 2500,
  perKmPaise: 700,
  includedKm: 2,
  /** Added per dispatch attempt beyond the first, to attract riders when nobody accepts. */
  incentiveStepPaise: 1000,
  maxIncentivePaise: 5000,
} as const;

/** What the rider earns for a trip (shown on the offer before they accept). */
export function riderPayoutPaise(tripDistanceM: number, attempt: number): number {
  const extraKm = Math.max(0, Math.ceil(tripDistanceM / 1000 - RIDER_PAY.includedKm));
  const incentive = Math.min(
    Math.max(0, attempt - 1) * RIDER_PAY.incentiveStepPaise,
    RIDER_PAY.maxIncentivePaise,
  );
  return RIDER_PAY.basePaise + extraKm * RIDER_PAY.perKmPaise + incentive;
}
