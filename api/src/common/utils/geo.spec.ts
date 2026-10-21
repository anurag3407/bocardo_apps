import { decodeGeohashCenter, encodeGeohash, haversineMeters } from './geo';

describe('geo utils', () => {
  it('computes haversine distance (Koramangala → Indiranagar ≈ 4.5 km)', () => {
    const d = haversineMeters({ lat: 12.9352, lng: 77.6245 }, { lat: 12.9719, lng: 77.6412 });
    expect(d).toBeGreaterThan(4000);
    expect(d).toBeLessThan(5000);
  });

  it('encodes a known geohash and decodes back inside the cell', () => {
    const p = { lat: 12.9352, lng: 77.6245 };
    const hash = encodeGeohash(p, 6);
    expect(hash).toHaveLength(6);
    expect(hash.startsWith('tdr1')).toBe(true);
    const c = decodeGeohashCenter(hash);
    expect(haversineMeters(p, c)).toBeLessThan(700);
  });
});
