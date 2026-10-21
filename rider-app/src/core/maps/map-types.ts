export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  kind: 'restaurant' | 'home' | 'rider' | 'pin';
  label?: string;
}

/**
 * Provider-neutral map props. `DeliveryMap` is implemented with Mapbox today;
 * switching to Google Maps means a new implementation of this contract only.
 */
export interface DeliveryMapProps {
  markers: MapMarker[];
  /** Fit the camera to all markers (otherwise centers on `center`). */
  fitToMarkers?: boolean;
  center?: { lat: number; lng: number };
  zoom?: number;
  height?: number;
  /** Called with the map center after the user pans (address pin picker). */
  onCenterChanged?: (center: { lat: number; lng: number }) => void;
  showUserLocation?: boolean;
}
