import { existsSync } from 'node:fs';
import type { ConfigContext, ExpoConfig } from 'expo/config';
import { withAppBuildGradle } from 'expo/config-plugins';

/**
 * Native config. Firebase files are per-environment and git-ignored:
 *   GOOGLE_SERVICES_JSON / GOOGLE_SERVICE_INFO_PLIST point at them (EAS file secrets in CI).
 */
const androidFirebase = process.env.GOOGLE_SERVICES_JSON ?? './firebase/google-services.json';
const iosFirebase = process.env.GOOGLE_SERVICE_INFO_PLIST ?? './firebase/GoogleService-Info.plist';

assertReleaseEnv();

export default ({ config }: ConfigContext): ExpoConfig =>
  wrapReleaseSigning({
    ...config,
  name: 'Bocardo Partner',
  slug: 'bocardo-restaurant',
  version: '0.0.3',
  // tablets at the counter are often landscape
  orientation: 'default',
  icon: './assets/images/icon.png',
  scheme: 'bocardo-restaurant',
  userInterfaceStyle: 'automatic',
  platforms: ['ios', 'android'],
  ios: {
    bundleIdentifier: 'app.bocardo.restaurant',
    supportsTablet: true,
    // a missing file breaks config evaluation for every platform, so only reference it when present
    ...(existsSync(iosFirebase) ? { googleServicesFile: iosFirebase } : {}),
    // App Attest for Firebase App Check (OTP abuse protection)
    entitlements: { 'com.apple.developer.devicecheck.appattest-environment': 'production' },
    infoPlist: {
      UIBackgroundModes: ['remote-notification'],
      ITSAppUsesNonExemptEncryption: false,
      NSLocationWhenInUseUsageDescription: 'Bocardo Partner uses your location to pin your outlet on the delivery map.',
      NSCameraUsageDescription: 'Bocardo Partner uses the camera to photograph outlet documents and menu items.',
      NSPhotoLibraryUsageDescription: 'Bocardo Partner needs access to your photos to upload restaurant verification documents and menu photos.',
    },
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
          NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
          NSPrivacyAccessedAPITypeReasons: ['C617.1', '0A2A.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime',
          NSPrivacyAccessedAPITypeReasons: ['35F9.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace',
          NSPrivacyAccessedAPITypeReasons: ['E174.1'],
        },
      ],
      NSPrivacyCollectedDataTypes: [
        {
          NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypePreciseLocation',
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
        },
        {
          NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeCoarseLocation',
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
        },
        {
          NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypePhoneNumber',
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
        },
        {
          NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeName',
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
        },
        {
          NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypePhotosorVideos',
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
        },
        {
          NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeDeviceID',
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
        },
        {
          NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeUserID',
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
        },
      ],
    },
  },
  android: {
    package: 'app.bocardo.restaurant',
    versionCode: 3,
    ...(existsSync(androidFirebase) ? { googleServicesFile: androidFirebase } : {}),
    // keeps the Supabase session (SQLite) out of adb / cloud backups
    allowBackup: false,
    adaptiveIcon: {
      backgroundColor: '#6CDCF9',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'CAMERA', 'POST_NOTIFICATIONS', 'VIBRATE'],
    blockedPermissions: [
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.ACCESS_BACKGROUND_LOCATION',
      'android.permission.RECORD_AUDIO',
    ],
  },
  plugins: [
    'expo-router',
    ['expo-splash-screen', { backgroundColor: '#6CDCF9', image: './assets/images/splash-icon.png', imageWidth: 180 }],
    'expo-sqlite',
    ['expo-location', { locationWhenInUsePermission: 'Bocardo Partner uses your location to pin your outlet on the map.' }],
    ['expo-audio', { microphonePermission: false, recordAudioAndroid: false }],
    [
      'expo-image-picker',
      {
        cameraPermission: 'Bocardo Partner uses the camera to photograph outlet documents and menu items.',
        photosPermission: 'Bocardo Partner needs access to your photos to upload restaurant verification documents and menu photos.',
      },
    ],
    // without a monochrome small icon Android renders the launcher icon as a white square
    ['expo-notifications', { color: '#0596D1', icon: './assets/images/android-icon-monochrome.png', sounds: ['./assets/sounds/order_ring.wav'] }],
    '@react-native-firebase/app',
    '@react-native-firebase/messaging',
    '@react-native-firebase/app-check',
    [
      'expo-build-properties',
      {
        ios: { useFrameworks: 'static' },
        android: {
          extraProguardRules: [
            '-keep class com.mapbox.** { *; }',
            '-dontwarn com.mapbox.**',
          ].join('\n'),
        },
      },
    ],
    '@rnmapbox/maps',
  ],
  experiments: { typedRoutes: false, reactCompiler: true },
  extra: { eas: { projectId: 'de7b44f1-cca2-4e9e-802c-e43ed0cc3e7d' } },
});

function wrapReleaseSigning(cfg: ExpoConfig): ExpoConfig {
  return withAppBuildGradle(cfg, (mod) => {
    const contents = mod.modResults.contents;
    if (contents.includes('ANDROID_KEYSTORE_PATH')) return mod;
    const releaseBlock = `
        release {
            if (System.getenv('ANDROID_KEYSTORE_PATH')) {
                storeFile file(System.getenv('ANDROID_KEYSTORE_PATH'))
                storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD')
                keyAlias System.getenv('ANDROID_KEY_ALIAS')
                keyPassword System.getenv('ANDROID_KEY_PASSWORD') ?: System.getenv('ANDROID_KEYSTORE_PASSWORD')
            } else {
                storeFile file('debug.keystore')
                storePassword 'android'
                keyAlias 'androiddebugkey'
                keyPassword 'android'
            }
        }`;
    mod.modResults.contents = contents
      .replace(/(signingConfigs\s*\{\s*debug\s*\{[\s\S]*?\n\s*\})/, `$1${releaseBlock}`)
      .replace(/(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/, '$1signingConfig signingConfigs.release');
    return mod;
  });
}

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
