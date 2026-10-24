import { existsSync } from 'node:fs';
import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Native config. Firebase files are per-environment and git-ignored:
 *   GOOGLE_SERVICES_JSON / GOOGLE_SERVICE_INFO_PLIST point at them (EAS file secrets in CI).
 */
const androidFirebase = process.env.GOOGLE_SERVICES_JSON ?? './firebase/google-services.json';
const iosFirebase = process.env.GOOGLE_SERVICE_INFO_PLIST ?? './firebase/GoogleService-Info.plist';

assertReleaseEnv();

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Bocardo Rider',
  slug: 'bocardo-rider',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'bocardo-rider',
  userInterfaceStyle: 'automatic',
  platforms: ['ios', 'android'],
  ios: {
    bundleIdentifier: 'app.bocardo.rider',
    // a missing file breaks config evaluation for every platform, so only reference it when present
    ...(existsSync(iosFirebase) ? { googleServicesFile: iosFirebase } : {}),
    // App Attest for Firebase App Check (OTP abuse protection)
    entitlements: { 'com.apple.developer.devicecheck.appattest-environment': 'production' },
    infoPlist: { UIBackgroundModes: ['remote-notification', 'location', 'fetch'], ITSAppUsesNonExemptEncryption: false },
  },
  android: {
    package: 'app.bocardo.rider',
    ...(existsSync(androidFirebase) ? { googleServicesFile: androidFirebase } : {}),
    // keeps the Supabase session (SQLite) out of adb / cloud backups
    allowBackup: false,
    adaptiveIcon: {
      backgroundColor: '#6CDCF9',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    permissions: [
      'ACCESS_COARSE_LOCATION',
      'ACCESS_FINE_LOCATION',
      'ACCESS_BACKGROUND_LOCATION',
      // lets the app ask to be exempt from Doze/battery optimisation (allowed for delivery apps)
      'REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
      'CAMERA',
      'FOREGROUND_SERVICE',
      'FOREGROUND_SERVICE_LOCATION',
      'POST_NOTIFICATIONS',
      'VIBRATE',
    ],
    blockedPermissions: [
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VIDEO',
      'android.permission.RECORD_AUDIO',
    ],
  },
  plugins: [
    'expo-router',
    ['expo-splash-screen', { backgroundColor: '#6CDCF9', image: './assets/images/splash-icon.png', imageWidth: 180 }],
    'expo-sqlite',
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission: 'Bocardo Rider shares your location during deliveries so customers can track their order.',
        locationWhenInUsePermission: 'Bocardo Rider uses your location to find deliveries near you.',
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    ['expo-audio', { microphonePermission: false, recordAudioAndroid: false }],
    ['expo-image-picker', { cameraPermission: 'Bocardo Rider uses the camera to photograph delivered packages as proof of delivery.', photosPermission: false, microphonePermission: false }],
    // without a monochrome small icon Android renders the launcher icon as a white square
    ['expo-notifications', { color: '#0596D1', icon: './assets/images/android-icon-monochrome.png', sounds: ['./assets/sounds/order_ring.wav'] }],
    '@react-native-firebase/app',
    '@react-native-firebase/messaging',
    '@react-native-firebase/app-check',
    ['expo-build-properties', { ios: { useFrameworks: 'static' } }],
    '@rnmapbox/maps',
  ],
  experiments: { typedRoutes: false, reactCompiler: true },
  extra: { eas: { projectId: '1dae70fe-ded8-48a4-9f33-b642b4a19d2d' } },
});

/**
 * EXPO_PUBLIC_* values are inlined into the JS bundle at build time and .env is git-ignored
 * (never uploaded to EAS), so a release build without them silently ships pointing at localhost.
 * Fail the build instead of the app.
 */
function assertReleaseEnv() {
  const profile = process.env.EAS_BUILD_PROFILE;
  if (!profile || profile === 'development') return;
  const missing = ['EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY', 'EXPO_PUBLIC_MAPBOX_TOKEN'].filter(
    (name) => !process.env[name],
  );
  if (missing.length) throw new Error(`[${profile}] missing build env: ${missing.join(', ')} (set them in eas.json or EAS env)`);
  for (const name of ['EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_SUPABASE_URL']) {
    if (!process.env[name]!.startsWith('https://')) throw new Error(`[${profile}] ${name} must be https:// in release builds`);
  }
}
