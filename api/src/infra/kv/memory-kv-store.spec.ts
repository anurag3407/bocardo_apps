import { MemoryKvStore } from './memory-kv-store';

describe('MemoryKvStore', () => {
  it('honours onlyIfAbsent (the basis of locks and idempotency)', async () => {
    const kv = new MemoryKvStore();
    expect(await kv.set('k', 1, { onlyIfAbsent: true })).toBe(true);
    expect(await kv.set('k', 2, { onlyIfAbsent: true })).toBe(false);
    expect(await kv.get('k')).toBe(1);
  });

  it('expires keys', async () => {
    jest.useFakeTimers();
    const kv = new MemoryKvStore();
    await kv.set('k', 'v', { ttlSeconds: 1 });
    jest.advanceTimersByTime(1500);
    expect(await kv.get('k')).toBeNull();
    jest.useRealTimers();
  });

  it('returns nearest riders first within the radius', async () => {
    const kv = new MemoryKvStore();
    await kv.geoAdd('g', 'near', 77.625, 12.935);
    await kv.geoAdd('g', 'far', 77.7, 12.99);
    const hits = await kv.geoSearch('g', 77.6245, 12.9352, 3000, 10);
    expect(hits.map((h) => h.member)).toEqual(['near']);
  });
});
