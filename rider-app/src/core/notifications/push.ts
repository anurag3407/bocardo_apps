import {
  getInitialNotification,
  getMessaging,
  getToken,
  onMessage,
  onNotificationOpenedApp,
  onTokenRefresh,
  requestPermission,
  setBackgroundMessageHandler,
} from '@react-native-firebase/messaging';
import * as Notifications from 'expo-notifications';
import { AndroidImportance, AndroidNotificationVisibility } from 'expo-notifications';
import { Platform } from 'react-native';
import { httpClient } from '../api/http-client';
import { env } from '../config/env';

export type PushData = {
  type?: string;
  orderId?: string;
  offerId?: string;
  status?: string;
  channel?: string;
};

// Show notifications while the app is foregrounded, too.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

try {
  setBackgroundMessageHandler(getMessaging(), async () => undefined);
} catch {
  // Native Firebase messaging may not be active in non-native/test environments.
}

/** Android channels must exist before the permission prompt on Android 13+. */
export async function ensureChannels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('updates', {
    name: 'Order updates',
    importance: AndroidImportance.HIGH,
  });
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
    body: JSON.stringify({
      app: env.app,
      token,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
    }),
  });
}

/** Removes this device's FCM token from the API before clearing the session. */
export async function unregisterPush(): Promise<void> {
  try {
    const token = await getToken(getMessaging());
    if (!token) return;
    await httpClient(`/me/devices/${encodeURIComponent(token)}`, { method: 'DELETE' });
  } catch {
    // Best-effort cleanup; never block sign-out.
  }
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
    const rawData = (message.data ?? {}) as Record<string, string>;
    const data = rawData as PushData;
    onForegroundMessage?.(data);
    // FCM does not display notification payloads in the foreground — show it ourselves
    if (message.notification) {
      const channelId =
        data.channel === 'orders' || data.channel === 'offers' ? data.channel : 'updates';
      const ringing = channelId === 'orders' || channelId === 'offers';
      await Notifications.scheduleNotificationAsync({
        content: {
          title: message.notification.title,
          body: message.notification.body,
          data: rawData,
          sound: ringing ? 'order_ring.wav' : 'default',
        },
        trigger: Platform.OS === 'android' ? { channelId } : null,
      });
    }
  });
  return () => {
    offRefresh();
    offMessage();
  };
}

/** Routes a tap on a notification (foreground local, background FCM, or cold-start FCM) to the right screen. */
export function onNotificationTap(handler: (data: PushData) => void): () => void {
  let active = true;
  const seen = new Set<string>();
  const dispatch = (id: string | undefined, data: PushData | undefined) => {
    if (!active || !data) return;
    if (id) {
      if (seen.has(id)) return;
      seen.add(id);
    }
    handler(data);
  };

  const initial = Notifications.getLastNotificationResponse();
  if (initial) {
    dispatch(
      initial.notification.request.identifier,
      initial.notification.request.content.data as PushData,
    );
  }
  const sub = Notifications.addNotificationResponseReceivedListener((r) =>
    dispatch(r.notification.request.identifier, r.notification.request.content.data as PushData),
  );

  const messaging = getMessaging();
  void getInitialNotification(messaging)
    .then((remote) => {
      if (remote) dispatch(remote.messageId, (remote.data ?? {}) as PushData);
    })
    .catch(() => undefined);
  const offOpened = onNotificationOpenedApp(messaging, (remote) =>
    dispatch(remote.messageId, (remote.data ?? {}) as PushData),
  );

  return () => {
    active = false;
    sub.remove();
    offOpened();
  };
}
