import { GoogleGeoProvider, parseProtobufDuration } from './google-geo-provider';
import type { LatLng } from '../../common/utils/geo';

describe('GoogleGeoProvider', () => {
  const originalFetch = global.fetch;
  const apiKey = 'test-google-maps-api-key';
  let provider: GoogleGeoProvider;

  beforeEach(() => {
    provider = new GoogleGeoProvider(apiKey);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('parseProtobufDuration', () => {
    it('parses standard protobuf duration strings', () => {
      expect(parseProtobufDuration('540s')).toBe(540);
      expect(parseProtobufDuration('32.4s')).toBe(32);
      expect(parseProtobufDuration('32.6s')).toBe(33);
      expect(parseProtobufDuration('0s')).toBe(0);
    });

    it('handles unexpected inputs gracefully', () => {
      expect(parseProtobufDuration('')).toBe(0);
      expect(parseProtobufDuration('invalid')).toBe(0);
      expect(parseProtobufDuration(null as unknown as string)).toBe(0);
    });
  });

  describe('route', () => {
    const from: LatLng = { lat: 12.9716, lng: 77.5946 };
    const to: LatLng = { lat: 12.9816, lng: 77.6046 };

    it('returns distance and duration from Google Routes API', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          routes: [{ distanceMeters: 2450.7, duration: '412s' }],
        }),
      } as unknown as Response);

      const result = await provider.route(from, to);

      expect(result).toEqual({ distanceM: 2451, durationS: 412 });
      expect(global.fetch).toHaveBeenCalledWith(
        'https://routes.googleapis.com/directions/v2:computeRoutes',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-Goog-Api-Key': apiKey,
          }),
        }),
      );
    });

    it('falls back to DRIVE mode when TWO_WHEELER returns HTTP 400', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            routes: [{ distanceMeters: 3100, duration: '600s' }],
          }),
        } as unknown as Response);

      const result = await provider.route(from, to);

      expect(result).toEqual({ distanceM: 3100, durationS: 600 });
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('falls back to Haversine estimator on fetch failure', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network connection timeout'));

      const result = await provider.route(from, to);

      expect(result.distanceM).toBeGreaterThan(0);
      expect(result.durationS).toBeGreaterThan(0);
    });
  });

  describe('etaToDestination', () => {
    const origins: LatLng[] = [
      { lat: 12.9716, lng: 77.5946 },
      { lat: 12.972, lng: 77.595 },
    ];
    const destination: LatLng = { lat: 12.9816, lng: 77.6046 };

    it('returns indexed matrix estimates from Google Routes Matrix API', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          { originIndex: 0, destinationIndex: 0, distanceMeters: 1800, duration: '300s' },
          { originIndex: 1, destinationIndex: 0, distanceMeters: 1500, duration: '240s' },
        ],
      } as unknown as Response);

      const results = await provider.etaToDestination(origins, destination);

      expect(results).toEqual([
        { distanceM: 1800, durationS: 300 },
        { distanceM: 1500, durationS: 240 },
      ]);
    });

    it('chunks origins when exceeding 25 elements', async () => {
      const manyOrigins = Array.from({ length: 30 }, (_, i) => ({
        lat: 12.97 + i * 0.001,
        lng: 77.59 + i * 0.001,
      }));

      global.fetch = jest.fn().mockImplementation((_, init: RequestInit) => {
        const body = JSON.parse(init.body as string) as { origins: unknown[] };
        const count = body.origins.length;
        const elements = Array.from({ length: count }, (_, i) => ({
          originIndex: i,
          destinationIndex: 0,
          distanceMeters: 1000 + i * 10,
          duration: `${100 + i}s`,
        }));
        return Promise.resolve({
          ok: true,
          json: async () => elements,
        } as unknown as Response);
      });

      const results = await provider.etaToDestination(manyOrigins, destination);

      expect(results.length).toBe(30);
      expect(global.fetch).toHaveBeenCalledTimes(2); // 25 + 5
    });

    it('falls back to Haversine estimator on matrix fetch failure', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Rate limit exceeded'));

      const results = await provider.etaToDestination(origins, destination);

      expect(results.length).toBe(2);
      expect(results[0].distanceM).toBeGreaterThan(0);
      expect(results[1].distanceM).toBeGreaterThan(0);
    });
  });
});
