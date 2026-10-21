import {
  rankCandidates,
  riderPayoutPaise,
  scoreCandidate,
  type DispatchCandidate,
} from './scoring';

const rider = (over: Partial<DispatchCandidate>): DispatchCandidate => ({
  riderId: 'r',
  etaToRestaurantS: 300,
  distanceToRestaurantM: 1000,
  idleSeconds: 300,
  acceptanceRate: 0.9,
  ratingAvg: 4.6,
  ratingCount: 100,
  ...over,
});

describe('dispatch scoring', () => {
  it('prefers the closer rider when everything else is equal', () => {
    const [first] = rankCandidates([
      rider({ riderId: 'far', etaToRestaurantS: 900 }),
      rider({ riderId: 'near', etaToRestaurantS: 120 }),
    ]);
    expect(first.riderId).toBe('near');
  });

  it('penalises riders who keep ignoring offers', () => {
    expect(scoreCandidate(rider({ acceptanceRate: 0.2 }))).toBeLessThan(
      scoreCandidate(rider({ acceptanceRate: 1 })),
    );
  });

  it('treats riders with few ratings neutrally rather than by a noisy average', () => {
    expect(scoreCandidate(rider({ ratingAvg: 1, ratingCount: 2 }))).toBe(
      scoreCandidate(rider({ ratingAvg: 5, ratingCount: 2 })),
    );
  });

  it('keeps scores within [0, 1]', () => {
    const worst = scoreCandidate(
      rider({
        etaToRestaurantS: 99999,
        idleSeconds: -5,
        acceptanceRate: -1,
        ratingAvg: 0,
        ratingCount: 50,
      }),
    );
    const best = scoreCandidate(
      rider({
        etaToRestaurantS: 0,
        idleSeconds: 99999,
        acceptanceRate: 2,
        ratingAvg: 9,
        ratingCount: 50,
      }),
    );
    expect(worst).toBeGreaterThanOrEqual(0);
    expect(best).toBeLessThanOrEqual(1);
  });

  it('raises rider pay with distance and repeated dispatch attempts, capped', () => {
    expect(riderPayoutPaise(1500, 1)).toBe(2500);
    expect(riderPayoutPaise(4500, 1)).toBe(2500 + 3 * 700);
    expect(riderPayoutPaise(1500, 3)).toBe(2500 + 2000);
    expect(riderPayoutPaise(1500, 99)).toBe(2500 + 5000);
  });
});
