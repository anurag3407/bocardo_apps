import Mapbox, { Camera, LocationPuck, MapView, MarkerView } from '@rnmapbox/maps';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/ui';
import { env } from '../config/env';
import type { DeliveryMapProps, MapMarker } from './map-types';

Mapbox.setAccessToken(env.mapboxToken);

const MARKER_ICON: Record<MapMarker['kind'], string> = { restaurant: '🍽️', home: '🏠', rider: '🛵', pin: '📍' };

export function DeliveryMap({ markers, fitToMarkers, center, zoom = 14, height = 260, onCenterChanged, showUserLocation }: DeliveryMapProps) {
  const t = useTheme();
  const bounds = fitToMarkers && markers.length > 1 ? boundsOf(markers) : undefined;
  const fallbackCenter = center ?? markers[0] ?? { lat: 12.9716, lng: 77.5946 };

  return (
    <View style={[styles.wrap, { height, borderColor: t.border }]}>
      <MapView
        style={StyleSheet.absoluteFill}
        styleURL={Mapbox.StyleURL.Street}
        logoEnabled={false}
        scaleBarEnabled={false}
        onMapIdle={onCenterChanged ? (state) => {
          const [lng, lat] = state.properties.center;
          onCenterChanged({ lat, lng });
        } : undefined}>
        <Camera
          {...(bounds
            ? { bounds: { ...bounds, paddingTop: 48, paddingBottom: 48, paddingLeft: 48, paddingRight: 48 } }
            : { centerCoordinate: [fallbackCenter.lng, fallbackCenter.lat], zoomLevel: zoom })}
          animationDuration={600}
        />
        {showUserLocation ? <LocationPuck /> : null}
        {markers.map((m) => (
          <MarkerView key={m.id} coordinate={[m.lng, m.lat]} allowOverlap>
            <View style={[styles.marker, { backgroundColor: t.surfaceRaised, borderColor: m.kind === 'rider' ? t.brand : t.border }]}>
              <MarkerGlyph kind={m.kind} />
            </View>
          </MarkerView>
        ))}
      </MapView>
    </View>
  );
}

function MarkerGlyph({ kind }: { kind: MapMarker['kind'] }) {
  return <Text style={{ fontSize: 18 }}>{MARKER_ICON[kind]}</Text>;
}

function boundsOf(markers: MapMarker[]) {
  const lats = markers.map((m) => m.lat);
  const lngs = markers.map((m) => m.lng);
  return { ne: [Math.max(...lngs), Math.max(...lats)], sw: [Math.min(...lngs), Math.min(...lats)] };
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 16, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  marker: { padding: 6, borderRadius: 20, borderWidth: 2 },
});
