import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { httpClient } from '../api/http-client';
import { kv } from '../storage/kv';

/**
 * Background GPS for riders. Runs as an Android foreground service / iOS background
 * location session so tracking survives the app being backgrounded or the screen off.
 * Points that fail to upload (no network) are queued and replayed in order.
 */
export const LOCATION_TASK = 'bocardo-rider-location';
const QUEUE_KEY = 'rider-location-queue';
const MAX_QUEUE = 300;

interface Point {
  lat: number;
  lng: number;
  accuracyM?: number;
  speedMps?: number;
  heading?: number;
  isMock: boolean;
  recordedAt: string;
}

const toPoint = (l: Location.LocationObject): Point => ({
  lat: l.coords.latitude,
  lng: l.coords.longitude,
  accuracyM: l.coords.accuracy ?? undefined,
  speedMps: l.coords.speed !== null && l.coords.speed >= 0 ? l.coords.speed : undefined,
  heading: l.coords.heading !== null && l.coords.heading >= 0 ? l.coords.heading : undefined,
  isMock: Boolean((l as { mocked?: boolean }).mocked),
  recordedAt: new Date(l.timestamp).toISOString(),
});

let flushing = false;

/** Sends queued + new points; keeps them if the network is down. */
export async function uploadPoints(points: Point[]) {
  const queued: Point[] = JSON.parse((await kv.getItem(QUEUE_KEY)) ?? '[]');
  const all = [...queued, ...points].slice(-MAX_QUEUE);
  if (flushing) {
    await kv.setItem(QUEUE_KEY, JSON.stringify(all));
    return;
  }
  flushing = true;
  try {
    for (let i = 0; i < all.length; i += 100) {
      await httpClient('/rider/location', { method: 'POST', body: JSON.stringify({ points: all.slice(i, i + 100) }) });
    }
    await kv.removeItem(QUEUE_KEY);
  } catch {
    await kv.setItem(QUEUE_KEY, JSON.stringify(all));
  } finally {
    flushing = false;
  }
}

// Must be defined at module scope and imported at app start (see app/_layout.tsx).
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;
  await uploadPoints(data.locations.map(toPoint));
});

export class BackgroundPermissionError extends Error {
  constructor() {
    super('Allow location "All the time" so customers can track deliveries while the app is in the background');
  }
}

export async function startTracking() {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') throw new BackgroundPermissionError();
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== 'granted') throw new BackgroundPermissionError();
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) return;
  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 5_000,
    distanceInterval: 15,
    deferredUpdatesInterval: 5_000,
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.OtherNavigation,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'You are on duty',
      notificationBody: 'Bocardo is sharing your location for deliveries',
      notificationColor: '#FF5A1F',
    },
  });
}

export async function stopTracking() {
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
}

export async function currentPosition() {
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
}

/** Opens turn-by-turn navigation in Google Maps (falls back to the browser). */
export function navigationUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=two-wheeler`;
}
