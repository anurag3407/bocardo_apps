import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Native config. Firebase files are per-environment and git-ignored:
 *   GOOGLE_SERVICES_JSON / GOOGLE_SERVICE_INFO_PLIST point at them (EAS file secrets in CI).
 */
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
    googleServicesFile: process.env.GOOGLE_SERVICE_INFO_PLIST ?? './firebase/GoogleService-Info.plist',
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
    ['expo-notifications', { color: '#FF5A1F', defaultChannel: 'offers', sounds: ['./assets/sounds/order_ring.wav'] }],
    '@react-native-firebase/app',
    '@react-native-firebase/messaging',
    ['expo-build-properties', { ios: { useFrameworks: 'static' } }],
    '@rnmapbox/maps',
  ],
  experiments: { typedRoutes: false, reactCompiler: true },
  extra: { eas: { projectId: process.env.EAS_PROJECT_ID } },
});
