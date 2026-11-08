import { MemoryKvStore } from '../kv/memory-kv-store';
import { CachingGeoProvider } from './caching-geo-provider';
import type { GeoProvider, RouteEstimate } from './geo-provider';
import { CircuitBreaker, MapsBudget } from './maps-guard';

const road: RouteEstimate = { distanceM: 2000, durationS: 400 };
const a = { lat: 12.9716, lng: 77.5946 };
const b = { lat: 12.9816, lng: 77.6046 };

describe('CachingGeoProvider', () => {
  let inner: jest.Mocked<GeoProvider>;
  let geo: CachingGeoProvider;

  beforeEach(() => {
    inner = { route: jest.fn(), etaToDestination: jest.fn() };
    geo = new CachingGeoProvider(inner, new MemoryKvStore());
  });

  it('pays once for repeated and concurrent routes', async () => {
    inner.route.mockResolvedValue(road);
    await Promise.all([geo.route(a, b), geo.route(a, b)]);
    await geo.route(a, b);
    expect(inner.route).toHaveBeenCalledTimes(1);
  });

  it('never caches straight-line estimates', async () => {
    inner.route.mockResolvedValue({ ...road, estimated: true });
    await geo.route(a, b);
    await geo.route(a, b);
    expect(inner.route).toHaveBeenCalledTimes(2);
  });

  it('requests only uncached riders and keeps result order', async () => {
    const far = { lat: 12.9, lng: 77.5 };
    inner.etaToDestination.mockResolvedValueOnce([road]);
    await geo.etaToDestination([a], b);

    const other = { distanceM: 9000, durationS: 1500 };
    inner.etaToDestination.mockResolvedValueOnce([other]);
    const results = await geo.etaToDestination([far, a], b);

    expect(inner.etaToDestination).toHaveBeenLastCalledWith([far], b);
    expect(results).toEqual([other, road]);
  });
});

describe('maps guards', () => {
  it('blocks spending past the daily budget', async () => {
    const budget = new MapsBudget(new MemoryKvStore(), 5);
    await expect(budget.tryConsume('routes', 5)).resolves.toBe(true);
    await expect(budget.tryConsume('routes', 1)).resolves.toBe(false);
  });

  it('opens the breaker after repeated failures', () => {
    const breaker = new CircuitBreaker(2, 60_000);
    breaker.failure();
    expect(breaker.open).toBe(false);
    breaker.failure();
    expect(breaker.open).toBe(true);
  });
});
