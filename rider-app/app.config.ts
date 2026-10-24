import type { ConfigContext, ExpoConfig } from 'expo/config';
import { withAndroidManifest, type ConfigPlugin } from '@expo/config-plugins';

const withNotificationChannelToolsReplace: ConfigPlugin = (config) => {
  return withAndroidManifest(config, (config) => {
    const mainApplication = config.modResults.manifest.application?.[0];
    if (mainApplication?.['meta-data']) {
      for (const meta of mainApplication['meta-data']) {
        if (meta.$?.['android:name'] === 'com.google.firebase.messaging.default_notification_channel_id') {
          meta.$['tools:replace'] = 'android:value';
        }
      }
    }
    return config;
  });
};

/**
 * Native config. Firebase files are per-environment and git-ignored:
 *   GOOGLE_SERVICES_JSON / GOOGLE_SERVICE_INFO_PLIST point at them (EAS file secrets in CI).
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const baseConfig: ExpoConfig = {
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
      googleServicesFile: process.env.GOOGLE_SERVICE_INFO_PLIST ?? './firebase/GoogleService-Info.plist',
      // App Attest for Firebase App Check (OTP abuse protection)
      entitlements: { 'com.apple.developer.devicecheck.appattest-environment': 'production' },
      infoPlist: { UIBackgroundModes: ['remote-notification', 'location', 'fetch'] },
    },
    android: {
      package: 'app.bocardo.rider',
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './firebase/google-services.json',
      adaptiveIcon: {
        backgroundColor: '#FF5A1F',
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
      ],
    },
    plugins: [
      'expo-router',
      ['expo-splash-screen', { backgroundColor: '#FF5A1F', image: './assets/images/splash-icon.png', imageWidth: 76 }],
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
      ['expo-notifications', { color: '#FF5A1F', defaultChannel: 'offers', sounds: ['./assets/sounds/order_ring.wav'] }],
      '@react-native-firebase/app',
      '@react-native-firebase/messaging',
      '@react-native-firebase/app-check',
      ['expo-build-properties', { ios: { useFrameworks: 'static' } }],
      '@rnmapbox/maps',
    ],
    experiments: { typedRoutes: false, reactCompiler: true },
    extra: { eas: { projectId: '1dae70fe-ded8-48a4-9f33-b642b4a19d2d' } },
  };

  return withNotificationChannelToolsReplace(baseConfig);
};
