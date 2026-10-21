import { env } from '../config/env';

export interface GeocodedPlace {
  label: string;
  line1: string;
  city: string | null;
  pincode: string | null;
  lat: number;
  lng: number;
}

/** Mapbox Search (Geocoding v6). Same shape would be returned by a Google Places adapter. */
const BASE = 'https://api.mapbox.com/search/geocode/v6';

interface Feature {
  geometry: { coordinates: [number, number] };
  properties: {
    full_address?: string;
    name?: string;
    context?: { place?: { name: string }; postcode?: { name: string } };
  };
}

function toPlace(f: Feature): GeocodedPlace {
  const [lng, lat] = f.geometry.coordinates;
  return {
    label: f.properties.full_address ?? f.properties.name ?? 'Pinned location',
    line1: f.properties.name ?? '',
    city: f.properties.context?.place?.name ?? null,
    pincode: f.properties.context?.postcode?.name ?? null,
    lat,
    lng,
  };
}

export async function reverseGeocode(lat: number, lng: number): Promise<GeocodedPlace | null> {
  if (!env.mapboxToken) return null;
  const res = await fetch(`${BASE}/reverse?longitude=${lng}&latitude=${lat}&country=in&access_token=${env.mapboxToken}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { features: Feature[] };
  return data.features[0] ? toPlace(data.features[0]) : null;
}

export async function searchPlaces(query: string, near?: { lat: number; lng: number }): Promise<GeocodedPlace[]> {
  if (!env.mapboxToken || query.trim().length < 3) return [];
  const proximity = near ? `&proximity=${near.lng},${near.lat}` : '';
  const res = await fetch(`${BASE}/forward?q=${encodeURIComponent(query)}&country=in&limit=6${proximity}&access_token=${env.mapboxToken}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { features: Feature[] };
  return data.features.map(toPlace);
}
