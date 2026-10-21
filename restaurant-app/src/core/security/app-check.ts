import { getApp } from '@react-native-firebase/app';
import {
  getLimitedUseToken,
  initializeAppCheck,
  ReactNativeFirebaseAppCheckProvider,
  type AppCheck,
} from '@react-native-firebase/app-check';

let instance: AppCheck | null = null;

/**
 * Firebase App Check proves requests come from the genuine, unmodified app on a real device
 * (Play Integrity on Android, App Attest on iOS). Debug builds use a debug token registered
 * in the Firebase console (EXPO_PUBLIC_APP_CHECK_DEBUG_TOKEN).
 */
function appCheck(): AppCheck {
  if (!instance) {
    const provider = new ReactNativeFirebaseAppCheckProvider();
    const debugToken = process.env.EXPO_PUBLIC_APP_CHECK_DEBUG_TOKEN || undefined;
    provider.configure({
      android: { provider: __DEV__ ? 'debug' : 'playIntegrity', debugToken },
      apple: { provider: __DEV__ ? 'debug' : 'appAttestWithDeviceCheckFallback', debugToken },
    });
    instance = initializeAppCheck(getApp(), { provider, isTokenAutoRefreshEnabled: true });
  }
  return instance;
}

/** Single-use token for sensitive calls (OTP requests); null if attestation is unavailable. */
export async function limitedUseAppCheckToken(): Promise<string | null> {
  try {
    return (await getLimitedUseToken(appCheck())).token;
  } catch {
    return null;
  }
}
