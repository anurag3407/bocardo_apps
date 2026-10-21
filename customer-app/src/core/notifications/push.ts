import { getMessaging, getToken, onMessage, onTokenRefresh, requestPermission } from '@react-native-firebase/messaging';
import * as Notifications from 'expo-notifications';
import { AndroidImportance, AndroidNotificationVisibility } from 'expo-notifications';
import { Platform } from 'react-native';
import { httpClient } from '../api/http-client';
import { env } from '../config/env';

export type PushData = { type?: string; orderId?: string; offerId?: string };

// Show notifications while the app is foregrounded, too.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/** Android channels must exist before the permission prompt on Android 13+. */
export async function ensureChannels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('updates', { name: 'Order updates', importance: AndroidImportance.HIGH });
  await Notifications.setNotificationChannelAsync('orders', {
    name: 'New orders',
    importance: AndroidImportance.MAX,
    sound: 'order_ring.wav',
    vibrationPattern: [0, 500, 300, 500],
    lockscreenVisibility: AndroidNotificationVisibility.PUBLIC,
    bypassDnd: true,
  });
  await Notifications.setNotificationChannelAsync('offers', {
    name: 'Delivery requests',
    importance: AndroidImportance.MAX,
    sound: 'order_ring.wav',
    vibrationPattern: [0, 500, 300, 500],
  });
}

async function register(token: string) {
  await httpClient('/me/devices', {
    method: 'POST',
    body: JSON.stringify({ app: env.app, token, platform: Platform.OS === 'ios' ? 'ios' : 'android' }),
  });
}

/**
 * Asks for permission, then registers this device's FCM token with the API.
 * Returns an unsubscribe for token-refresh/foreground listeners.
 */
export async function enablePush(onForegroundMessage?: (data: PushData) => void): Promise<() => void> {
  await ensureChannels();
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return () => undefined;

  const messaging = getMessaging();
  await requestPermission(messaging);
  await register(await getToken(messaging));

  const offRefresh = onTokenRefresh(messaging, (token) => void register(token).catch(() => undefined));
  const offMessage = onMessage(messaging, async (message) => {
    onForegroundMessage?.((message.data ?? {}) as PushData);
    // FCM does not display notification payloads in the foreground — show it ourselves
    if (message.notification) {
      await Notifications.scheduleNotificationAsync({
        content: { title: message.notification.title, body: message.notification.body, data: message.data ?? {} },
        trigger: null,
      });
    }
  });
  return () => {
    offRefresh();
    offMessage();
  };
}

/** Routes a tap on a notification (cold start or background) to the right screen. */
export function onNotificationTap(handler: (data: PushData) => void): () => void {
  const initial = Notifications.getLastNotificationResponse();
  if (initial) handler(initial.notification.request.content.data as PushData);
  const sub = Notifications.addNotificationResponseReceivedListener((r) => handler(r.notification.request.content.data as PushData));
  return () => sub.remove();
}
