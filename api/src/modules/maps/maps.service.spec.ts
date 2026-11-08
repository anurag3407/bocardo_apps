import { MemoryKvStore } from '../../infra/kv/memory-kv-store';
import { MapsService } from './maps.service';
import type { Env } from '../../config/env';

describe('MapsService', () => {
  let kv: MemoryKvStore;
  let service: MapsService;
  const originalFetch = global.fetch;

  const mockEnv = (apiKey?: string): Env =>
    ({
      GOOGLE_MAPS_API_KEY: apiKey,
      MAPBOX_ACCESS_TOKEN: undefined,
    }) as unknown as Env;

  beforeEach(() => {
    kv = new MemoryKvStore();
    service = new MapsService(mockEnv('test-google-key'), kv);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('autocomplete', () => {
    it('queries Google Places and returns predictions', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          suggestions: [
            {
              placePrediction: {
                placeId: 'places/ChIJ123',
                text: { text: 'Indiranagar, Bengaluru' },
                structuredFormat: {
                  mainText: { text: 'Indiranagar' },
                  secondaryText: { text: 'Bengaluru, Karnataka' },
                },
              },
            },
          ],
        }),
      } as unknown as Response);

      const result = await service.autocomplete({
        query: 'Indiranagar',
        sessionToken: '12345678-1234-1234-1234-123456789abc',
        lat: 12.9716,
        lng: 77.5946,
      });

      expect(result).toEqual([
        {
          placeId: 'places/ChIJ123',
          label: 'Indiranagar, Bengaluru',
          mainText: 'Indiranagar',
          secondaryText: 'Bengaluru, Karnataka',
        },
      ]);
    });
  });

  describe('placeDetails', () => {
    it('resolves coordinates and components from Google Place Details', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'ChIJ123',
          displayName: { text: 'Biryani Bros Indiranagar' },
          formattedAddress: '100 Feet Rd, Indiranagar, Bengaluru, 560038',
          location: { latitude: 12.9784, longitude: 77.6408 },
          addressComponents: [
            { longText: 'Bengaluru', types: ['locality'] },
            { longText: '560038', types: ['postal_code'] },
          ],
        }),
      } as unknown as Response);

      const result = await service.placeDetails({
        placeId: 'ChIJ123',
        sessionToken: '12345678-1234-1234-1234-123456789abc',
      });

      expect(result).toEqual({
        label: '100 Feet Rd, Indiranagar, Bengaluru, 560038',
        line1: '100 Feet Rd',
        city: 'Bengaluru',
        pincode: '560038',
        lat: 12.9784,
        lng: 77.6408,
      });

      const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
      expect(url).not.toContain('displayName');
    });

    it('never invents a place in production when Google fails', async () => {
      const prod = new MapsService(
        { ...mockEnv('test-google-key'), NODE_ENV: 'production' } as Env,
        kv,
      );
      global.fetch = jest.fn().mockRejectedValue(new Error('down'));

      await expect(prod.placeDetails({ placeId: 'ChIJ123' })).resolves.toBeNull();
      await expect(prod.reverseGeocode({ lat: 12.97, lng: 77.59 })).resolves.toBeNull();
      await expect(
        prod.autocomplete({
          query: 'mg road',
          sessionToken: '12345678-1234-1234-1234-123456789abc',
        }),
      ).resolves.toEqual([]);
    });
  });

  describe('reverseGeocode', () => {
    const lat = 12.9716;
    const lng = 77.5946;

    it('skips Plus Code results and treats quota errors as failures', async () => {
      const prod = new MapsService(
        { ...mockEnv('test-google-key'), NODE_ENV: 'production' } as Env,
        kv,
      );
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'OVER_QUERY_LIMIT', results: [] }),
      } as unknown as Response);
      await expect(prod.reverseGeocode({ lat, lng })).resolves.toBeNull();

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'OK',
          results: [
            { types: ['plus_code'], formatted_address: 'WQ8V+J5 Bengaluru' },
            { types: ['street_address'], formatted_address: 'MG Road, Bengaluru' },
          ],
        }),
      } as unknown as Response);
      const place = await prod.reverseGeocode({ lat, lng });
      expect(place?.label).toBe('MG Road, Bengaluru');
    });

    it('quantizes to Geohash-8 and returns cached result on subsequent calls', async () => {
      const fetchSpy = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            {
              formatted_address: 'MG Road, Bengaluru, Karnataka 560001',
              address_components: [
                { long_name: 'Bengaluru', types: ['locality'] },
                { long_name: '560001', types: ['postal_code'] },
                { long_name: 'Shanthala Nagar', types: ['sublocality_level_1'] },
              ],
            },
          ],
        }),
      } as unknown as Response);
      global.fetch = fetchSpy;

      // First call (cache miss)
      const first = await service.reverseGeocode({ lat, lng });
      expect(first?.label).toBe('MG Road, Bengaluru, Karnataka 560001');
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Second call very close to same spot (~10 meters away)
      const second = await service.reverseGeocode({ lat: lat + 0.00005, lng: lng + 0.00005 });
      expect(second?.label).toBe('MG Road, Bengaluru, Karnataka 560001');
      expect(second?.lat).toBe(lat + 0.00005);
      // Must not call Google API again!
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });
});
