import { httpClient } from '../api/http-client';
import { env } from '../config/env';

export interface GeocodedPlace {
  label: string;
  line1: string;
  city: string | null;
  pincode: string | null;
  lat: number;
  lng: number;
}

export interface PlacePrediction {
  placeId: string;
  label: string;
  mainText: string;
  secondaryText: string;
}

/**
 * Reverse geocode a coordinate via Bocardo's backend Maps Gateway.
 * The backend leverages Geohash-7 spatial caching in Redis so adjacent pin moves
 * in the same society/block are free and return in 2ms without calling Google again.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<GeocodedPlace | null> {
  try {
    const res = await httpClient<GeocodedPlace | null>(
      `/maps/reverse-geocode?lat=${lat}&lng=${lng}`,
    );
    if (res) return res;
  } catch {
    // If backend maps endpoint is unreachable, fall back to client-side Mapbox if token present
    if (env.mapboxToken) {
      return fallbackMapboxReverse(lat, lng);
    }
  }
  return null;
}

/**
 * Queries Places Autocomplete through Bocardo's backend gateway with a Session Token.
 * All keystrokes in a single address search session are bundled under this token,
 * capping billing at Google's flat session rate.
 */
export async function autocompletePlaces(
  query: string,
  sessionToken: string,
  near?: { lat: number; lng: number },
): Promise<PlacePrediction[]> {
  if (query.trim().length < 3) return [];
  const coords = near ? `&lat=${near.lat}&lng=${near.lng}` : '';
  try {
    const predictions = await httpClient<PlacePrediction[]>(
      `/maps/autocomplete?query=${encodeURIComponent(query)}&sessionToken=${sessionToken}${coords}`,
    );
    return predictions ?? [];
  } catch {
    return [];
  }
}

/**
 * Resolves place details (exact coordinates & structured address) using the session token.
 */
export async function getPlaceDetails(
  placeId: string,
  sessionToken?: string,
): Promise<GeocodedPlace | null> {
  const tokenParam = sessionToken ? `&sessionToken=${sessionToken}` : '';
  try {
    return await httpClient<GeocodedPlace | null>(
      `/maps/place-details?placeId=${encodeURIComponent(placeId)}${tokenParam}`,
    );
  } catch {
    return null;
  }
}

// ── Client Mapbox fallback if API is unreachable ───────────────────────────

const MAPBOX_BASE = 'https://api.mapbox.com/search/geocode/v6';

interface Feature {
  geometry: { coordinates: [number, number] };
  properties: {
    full_address?: string;
    name?: string;
    context?: { place?: { name: string }; postcode?: { name: string } };
  };
}

async function fallbackMapboxReverse(lat: number, lng: number): Promise<GeocodedPlace | null> {
  try {
    const res = await fetch(
      `${MAPBOX_BASE}/reverse?longitude=${lng}&latitude=${lat}&country=in&access_token=${env.mapboxToken}`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { features: Feature[] };
    const f = data.features[0];
    if (!f) return null;
    const [flng, flat] = f.geometry.coordinates;
    return {
      label: f.properties.full_address ?? f.properties.name ?? 'Pinned location',
      line1: f.properties.name ?? '',
      city: f.properties.context?.place?.name ?? null,
      pincode: f.properties.context?.postcode?.name ?? null,
      lat: flat,
      lng: flng,
    };
  } catch {
    return null;
  }
}
