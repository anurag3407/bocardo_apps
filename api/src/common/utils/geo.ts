export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h)));
}

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/** Standard geohash; precision 6 ≈ 1.2km × 0.6km cells, used as cache keys for listings. */
export function encodeGeohash({ lat, lng }: LatLng, precision = 6): string {
  let latRange: [number, number] = [-90, 90];
  let lngRange: [number, number] = [-180, 180];
  let hash = '';
  let bit = 0;
  let ch = 0;
  let evenBit = true;
  while (hash.length < precision) {
    const range = evenBit ? lngRange : latRange;
    const value = evenBit ? lng : lat;
    const mid = (range[0] + range[1]) / 2;
    if (value >= mid) {
      ch = (ch << 1) | 1;
      range[0] = mid;
    } else {
      ch = ch << 1;
      range[1] = mid;
    }
    if (evenBit) lngRange = range;
    else latRange = range;
    evenBit = !evenBit;
    if (++bit === 5) {
      hash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return hash;
}

export function decodeGeohashCenter(hash: string): LatLng {
  const latRange = [-90, 90];
  const lngRange = [-180, 180];
  let evenBit = true;
  for (const c of hash) {
    const idx = BASE32.indexOf(c);
    for (let n = 4; n >= 0; n--) {
      const bitN = (idx >> n) & 1;
      const range = evenBit ? lngRange : latRange;
      const mid = (range[0] + range[1]) / 2;
      if (bitN) range[0] = mid;
      else range[1] = mid;
      evenBit = !evenBit;
    }
  }
  return { lat: (latRange[0] + latRange[1]) / 2, lng: (lngRange[0] + lngRange[1]) / 2 };
}
