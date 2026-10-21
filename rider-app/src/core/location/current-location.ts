import * as Location from 'expo-location';

export interface Coords {
  lat: number;
  lng: number;
}

export class LocationPermissionError extends Error {
  constructor() {
    super('Location permission is required');
  }
}

export async function currentLocation(): Promise<Coords> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new LocationPermissionError();
  const last = await Location.getLastKnownPositionAsync({ maxAge: 60_000 });
  const pos = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
}
