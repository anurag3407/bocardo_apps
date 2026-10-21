import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Native config. Firebase files are per-environment and git-ignored:
 *   GOOGLE_SERVICES_JSON / GOOGLE_SERVICE_INFO_PLIST point at them (EAS file secrets in CI).
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Bocardo',
  slug: 'bocardo-customer',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'bocardo-customer',
  userInterfaceStyle: 'automatic',
  platforms: ['ios', 'android'],
  ios: {
    bundleIdentifier: 'app.bocardo.customer',
    googleServicesFile: process.env.GOOGLE_SERVICE_INFO_PLIST ?? './firebase/GoogleService-Info.plist',
    // App Attest for Firebase App Check (OTP abuse protection)
    entitlements: { 'com.apple.developer.devicecheck.appattest-environment': 'production' },
    infoPlist: { UIBackgroundModes: ['remote-notification'] },
  },
  android: {
    package: 'app.bocardo.customer',
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './firebase/google-services.json',
    adaptiveIcon: {
      backgroundColor: '#FF5A1F',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'POST_NOTIFICATIONS'],
  },
  plugins: [
    'expo-router',
    ['expo-splash-screen', { backgroundColor: '#FF5A1F', image: './assets/images/splash-icon.png', imageWidth: 76 }],
    'expo-sqlite',
    ['expo-location', { locationWhenInUsePermission: 'Bocardo uses your location to show restaurants that deliver to you.' }],
    ['expo-notifications', { color: '#FF5A1F', defaultChannel: 'updates' }],
    '@react-native-firebase/app',
    '@react-native-firebase/messaging',
    '@react-native-firebase/app-check',
    ['expo-build-properties', { ios: { useFrameworks: 'static' } }],
    '@rnmapbox/maps',
  ],
  experiments: { typedRoutes: false, reactCompiler: true },
  extra: { eas: { projectId: process.env.EAS_PROJECT_ID } },
});
