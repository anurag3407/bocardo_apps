import { Inject, Injectable, Logger } from '@nestjs/common';
import { encodeGeohash } from '../../common/utils/geo';
import { ENV, type Env } from '../../config/env';
import { CircuitBreaker, MapsBudget } from '../../infra/geo/maps-guard';
import { KV_STORE, type KvStore } from '../../infra/kv/kv-store';
import type {
  AutocompleteQueryDto,
  GeocodedPlace,
  PlaceDetailsQueryDto,
  PlacePrediction,
  ReverseGeocodeQueryDto,
} from './maps.dto';

/** Absorbs a customer nudging the pin back and forth; ~19m × 38m keeps the label on the right street. */
const REVERSE_GEOCODE_TTL_S = 15 * 60;
/** Mapbox suggestions carry coordinates; held until the customer picks one. */
const FALLBACK_PLACE_TTL_S = 15 * 60;
const TIMEOUT_MS = 3000;

/**
 * Essentials-tier fields only. Adding displayName moves every request to the Pro SKU.
 * Ending the autocomplete session on this call is also what makes the session bill correctly,
 * which is why place details are deliberately not cached.
 */
const PLACE_FIELDS = 'id,formattedAddress,location,addressComponents';

const fallbackPlaceKey = (id: string) => `maps:fallback-place:${id}`;

interface AddressParts {
  name?: string;
  types?: string[];
}

function cityAndPincode(parts: AddressParts[]) {
  const find = (type: string) => parts.find((p) => p.types?.includes(type))?.name ?? null;
  return {
    // many Indian addresses have no locality, only a district-level component
    city:
      find('locality') ??
      find('administrative_area_level_3') ??
      find('administrative_area_level_2'),
    pincode: find('postal_code'),
    sublocality: find('sublocality_level_1') ?? find('sublocality'),
  };
}

@Injectable()
export class MapsService {
  private readonly logger = new Logger(MapsService.name);
  private readonly breaker = new CircuitBreaker();
  private readonly budget: MapsBudget;
  /** Invented places are only for credential-less local dev: a real order must never see one. */
  private readonly allowMock: boolean;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(KV_STORE) private readonly kv: KvStore,
  ) {
    this.budget = new MapsBudget(kv, env.MAPS_DAILY_PLACES_CALLS ?? 10_000);
    this.allowMock = env.NODE_ENV !== 'production';
  }

  private async googleKey(): Promise<string | null> {
    const key = this.env.GOOGLE_MAPS_API_KEY;
    if (!key || this.breaker.open) return null;
    return (await this.budget.tryConsume('places')) ? key : null;
  }

  private failed(what: string, err: unknown) {
    this.breaker.failure();
    this.logger.warn(`google ${what} failed: ${(err as Error).message}`);
  }

  async autocomplete(dto: AutocompleteQueryDto): Promise<PlacePrediction[]> {
    const key = await this.googleKey();
    if (!key) return this.fallbackAutocomplete(dto);

    try {
      const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key },
        body: JSON.stringify({
          input: dto.query,
          sessionToken: dto.sessionToken,
          includedRegionCodes: ['in'],
          ...(dto.lat !== undefined && dto.lng !== undefined
            ? {
                locationBias: {
                  circle: {
                    center: { latitude: dto.lat, longitude: dto.lng },
                    radius: 25000.0,
                  },
                },
              }
            : {}),
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = (await res.json()) as {
        suggestions?: Array<{
          placePrediction?: {
            placeId?: string;
            text?: { text?: string };
            structuredFormat?: {
              mainText?: { text?: string };
              secondaryText?: { text?: string };
            };
          };
        }>;
      };
      this.breaker.success();

      return (data.suggestions ?? [])
        .map((s) => s.placePrediction)
        .filter((p): p is NonNullable<typeof p> => Boolean(p?.placeId && p?.text?.text))
        .map((p) => ({
          placeId: p.placeId!,
          label: p.text!.text!,
          mainText: p.structuredFormat?.mainText?.text ?? p.text!.text!,
          secondaryText: p.structuredFormat?.secondaryText?.text ?? '',
        }));
    } catch (err) {
      this.failed('autocomplete', err);
      return this.fallbackAutocomplete(dto);
    }
  }

  async placeDetails(dto: PlaceDetailsQueryDto): Promise<GeocodedPlace | null> {
    const cleanId = dto.placeId.replace(/^places\//, '');

    // ids minted by a fallback are meaningless to Google
    const fallback = await this.kv.get<GeocodedPlace>(fallbackPlaceKey(cleanId)).catch(() => null);
    if (fallback) return fallback;
    if (cleanId.startsWith('mock-')) return this.allowMock ? mockPlace() : null;

    const key = await this.googleKey();
    if (!key) return null;

    try {
      const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(cleanId)}`);
      url.searchParams.set('fields', PLACE_FIELDS);
      if (dto.sessionToken) url.searchParams.set('sessionToken', dto.sessionToken);

      const res = await fetch(url.toString(), {
        headers: { 'X-Goog-Api-Key': key },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = (await res.json()) as {
        formattedAddress?: string;
        location?: { latitude?: number; longitude?: number };
        addressComponents?: Array<{ longText?: string; types?: string[] }>;
      };
      this.breaker.success();

      const { latitude, longitude } = data.location ?? {};
      if (latitude == null || longitude == null) return null;

      const { city, pincode } = cityAndPincode(
        (data.addressComponents ?? []).map((c) => ({ name: c.longText, types: c.types })),
      );
      return {
        label: data.formattedAddress ?? 'Pinned location',
        line1: data.formattedAddress?.split(',')[0]?.trim() ?? '',
        city,
        pincode,
        lat: latitude,
        lng: longitude,
      };
    } catch (err) {
      this.failed('place details', err);
      return null;
    }
  }

  async reverseGeocode(dto: ReverseGeocodeQueryDto): Promise<GeocodedPlace | null> {
    const cacheKey = `maps:rev:${encodeGeohash({ lat: dto.lat, lng: dto.lng }, 8)}`;
    const cached = await this.kv.get<GeocodedPlace>(cacheKey).catch(() => null);
    // the coordinates in the entry belong to whoever populated it
    if (cached) return { ...cached, lat: dto.lat, lng: dto.lng };

    const key = await this.googleKey();
    if (!key) return this.fallbackReverseGeocode(dto.lat, dto.lng);

    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${dto.lat},${dto.lng}&key=${key}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = (await res.json()) as {
        status?: string;
        results?: Array<{
          types?: string[];
          formatted_address?: string;
          address_components?: Array<{ long_name?: string; types?: string[] }>;
        }>;
      };
      // this API reports quota and key failures inside an HTTP 200
      if (data.status && data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        throw new Error(`status ${data.status}`);
      }
      this.breaker.success();

      // the top hit is often a bare Plus Code, which is useless as an address
      const best = data.results?.find((r) => !r.types?.includes('plus_code'));
      if (!best) return null;

      const { city, pincode, sublocality } = cityAndPincode(
        (best.address_components ?? []).map((c) => ({ name: c.long_name, types: c.types })),
      );
      const place: GeocodedPlace = {
        label: best.formatted_address ?? 'Pinned location',
        line1: sublocality ?? best.formatted_address?.split(',')[0] ?? '',
        city,
        pincode,
        lat: dto.lat,
        lng: dto.lng,
      };
      await this.kv
        .set(cacheKey, place, { ttlSeconds: REVERSE_GEOCODE_TTL_S })
        .catch(() => undefined);
      return place;
    } catch (err) {
      this.failed('reverse geocode', err);
      return this.fallbackReverseGeocode(dto.lat, dto.lng);
    }
  }

  // ── Fallbacks ────────────────────────────────────────────────────────────

  private async fallbackAutocomplete(dto: AutocompleteQueryDto): Promise<PlacePrediction[]> {
    if (this.env.MAPBOX_ACCESS_TOKEN) {
      try {
        const proximity =
          dto.lat !== undefined && dto.lng !== undefined ? `&proximity=${dto.lng},${dto.lat}` : '';
        const url = `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(dto.query)}&country=in&limit=6${proximity}&access_token=${this.env.MAPBOX_ACCESS_TOKEN}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (res.ok) {
          const data = (await res.json()) as {
            features?: Array<{
              id: string;
              geometry?: { coordinates?: [number, number] };
              properties: {
                full_address?: string;
                name?: string;
                context?: { place?: { name?: string }; postcode?: { name?: string } };
              };
            }>;
          };
          const features = (data.features ?? []).filter((f) => f.geometry?.coordinates);
          await Promise.all(
            features.map((f) => {
              const [lng, lat] = f.geometry!.coordinates!;
              const place: GeocodedPlace = {
                label: f.properties.full_address ?? f.properties.name ?? dto.query,
                line1: f.properties.name ?? '',
                city: f.properties.context?.place?.name ?? null,
                pincode: f.properties.context?.postcode?.name ?? null,
                lat,
                lng,
              };
              return this.kv
                .set(fallbackPlaceKey(f.id), place, { ttlSeconds: FALLBACK_PLACE_TTL_S })
                .catch(() => undefined);
            }),
          );
          return features.map((f) => ({
            placeId: f.id,
            label: f.properties.full_address ?? f.properties.name ?? dto.query,
            mainText: f.properties.name ?? dto.query,
            secondaryText: f.properties.full_address ?? '',
          }));
        }
      } catch {
        // fall through
      }
    }
    if (!this.allowMock) return [];
    return [
      {
        placeId: 'mock-place-1',
        label: `${dto.query}, City Center`,
        mainText: dto.query,
        secondaryText: 'City Center, Bengaluru, Karnataka',
      },
    ];
  }

  private async fallbackReverseGeocode(lat: number, lng: number): Promise<GeocodedPlace | null> {
    if (this.env.MAPBOX_ACCESS_TOKEN) {
      try {
        const url = `https://api.mapbox.com/search/geocode/v6/reverse?longitude=${lng}&latitude=${lat}&country=in&access_token=${this.env.MAPBOX_ACCESS_TOKEN}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (res.ok) {
          const data = (await res.json()) as {
            features?: Array<{
              properties?: {
                full_address?: string;
                name?: string;
                context?: { place?: { name?: string }; postcode?: { name?: string } };
              };
            }>;
          };
          const f = data.features?.[0];
          if (f) {
            return {
              label: f.properties?.full_address ?? f.properties?.name ?? 'Pinned location',
              line1: f.properties?.name ?? '',
              city: f.properties?.context?.place?.name ?? null,
              pincode: f.properties?.context?.postcode?.name ?? null,
              lat,
              lng,
            };
          }
        }
      } catch {
        // fall through
      }
    }
    if (!this.allowMock) return null;
    return {
      ...mockPlace(),
      label: `Pinned Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
      lat,
      lng,
    };
  }
}

function mockPlace(): GeocodedPlace {
  return {
    label: 'Selected Location, Indiranagar, Bengaluru',
    line1: 'Indiranagar',
    city: 'Bengaluru',
    pincode: '560038',
    lat: 12.9716,
    lng: 77.5946,
  };
}
