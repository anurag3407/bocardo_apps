'use client';

import type { Map as MapboxMap } from 'mapbox-gl';
import { useEffect, useRef } from 'react';
import { env } from '@/core/config/env';

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  color: string;
  label?: string;
}

export interface MapPolygon {
  id: string;
  coordinates: number[][][];
  color: string;
}

/**
 * Thin Mapbox GL wrapper used by live ops and zones. Swapping to Google Maps means
 * re-implementing this component's props only.
 */
export function MapView({
  points = [],
  polygons = [],
  center = { lat: 12.9716, lng: 77.5946 },
  zoom = 11,
  height = 480,
  onReady,
}: {
  points?: MapPoint[];
  polygons?: MapPolygon[];
  center?: { lat: number; lng: number };
  zoom?: number;
  height?: number;
  onReady?: (map: MapboxMap) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapboxMap | null>(null);
  const markers = useRef<{ remove: () => void }[]>([]);

  useEffect(() => {
    let cancelled = false;
    void import('mapbox-gl').then(({ default: mapboxgl }) => {
      if (cancelled || !container.current || map.current) return;
      mapboxgl.accessToken = env.mapboxToken;
      map.current = new mapboxgl.Map({ container: container.current, style: 'mapbox://styles/mapbox/streets-v12', center: [center.lng, center.lat], zoom });
      map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
      map.current.on('load', () => onReady?.(map.current!));
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
    // the map is created once; data updates are handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    void import('mapbox-gl').then(({ default: mapboxgl }) => {
      markers.current.forEach((mk) => mk.remove());
      markers.current = points.map((p) =>
        new mapboxgl.Marker({ color: p.color })
          .setLngLat([p.lng, p.lat])
          .setPopup(p.label ? new mapboxgl.Popup({ offset: 20 }).setText(p.label) : undefined)
          .addTo(m),
      );
    });
  }, [points]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const draw = () => {
      for (const p of polygons) {
        const sourceId = `poly-${p.id}`;
        const data = { type: 'Feature' as const, properties: {}, geometry: { type: 'Polygon' as const, coordinates: p.coordinates } };
        const existing = m.getSource(sourceId) as { setData?: (d: unknown) => void } | undefined;
        if (existing?.setData) existing.setData(data);
        else {
          m.addSource(sourceId, { type: 'geojson', data });
          m.addLayer({ id: `${sourceId}-fill`, type: 'fill', source: sourceId, paint: { 'fill-color': p.color, 'fill-opacity': 0.12 } });
          m.addLayer({ id: `${sourceId}-line`, type: 'line', source: sourceId, paint: { 'line-color': p.color, 'line-width': 2 } });
        }
      }
    };
    if (m.isStyleLoaded()) draw();
    else m.once('load', draw);
  }, [polygons]);

  if (!env.mapboxToken) {
    return <div style={{ height }} className="flex items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted">Set NEXT_PUBLIC_MAPBOX_TOKEN to show maps</div>;
  }
  return <div ref={container} style={{ height }} className="w-full overflow-hidden rounded-xl border border-border" />;
}
