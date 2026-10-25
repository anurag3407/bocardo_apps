# Android APK size audit

Measured 2026-10-25 on `customer-app` (Expo SDK 58, RN 0.88, new architecture).
`restaurant-app` and `rider-app` use the same Gradle/EAS setup and the same native stack, so the
findings and fixes below apply to all three.

## TL;DR

- The **118.2 MB** APK in the repo is `android/app/build/outputs/apk/debug/app-debug.apk` — a
  **debug/dev-client** build from `expo run:android`. It has unminified dex, debug native libs, the
  dev-menu UI and no JS bundle (Metro serves it). It is not representative of a release.
- A real **release** build of the same app, arm64-only, is **55.5 MB**.
- A preview APK packages **four ABIs** (the Gradle default is
  `armeabi-v7a,arm64-v8a,x86,x86_64` and APK builds are not split), so a universal preview APK is
  roughly **~180 MB (estimated)**.
- The app's own code and assets are **~1.5 MB**. Everything else is the RN engine, native SDKs and
  generated resources.
- Biggest levers, in order: **stop shipping universal APKs**, **compress native libs in APKs**,
  **replace Mapbox** (~19 MB, 34% of the release APK), and **drop unused Reanimated/Worklets**.

## What was measured

| Artifact | ABIs | Size |
|---|---|---|
| `app-debug.apk` (`expo run:android`) | arm64-v8a | 118.2 MB |
| `app-release.apk` (R8, arm64-v8a) | arm64-v8a | **55.5 MB** |
| EAS `preview` (universal APK, estimate) | 4 ABIs | ~180 MB |

The release APK was built locally with the project's own Gradle config
(`./gradlew app:assembleRelease -PreactNativeArchitectures=arm64-v8a`), so it has the same R8 /
resource settings as EAS.

## Where the bytes are

### Debug APK — 118.2 MB (arm64 only)

| Bucket | Size |
|---|---|
| Native libraries | 89.0 MB |
| Dex (10 files, R8 off) | 63.8 MB |
| Resources (dev-menu fonts alone: 2.1 MB) | 4.8 MB |
| Assets (MLKit barcode models for dev-menu QR scanner: 0.9 MB) | 0.9 MB |
| JS bundle | 0 (loaded from Metro) |

Largest debug libs: `libreactnative` 23.0 MB, Mapbox 23.7 MB
(`mapbox-maps` 12.6 + `mapbox-common` 6.4 + `barhopper` 4.7), `libreanimated` 9.0 MB,
`libappmodules` 6.7 MB, `libworklets` 5.3 MB, `libhermesvm` 3.8 MB, `libreact_codegen_rnscreens` 3.8 MB.

### Release APK — 55.5 MB (arm64 only)

| Bucket | Size | Notes |
|---|---|---|
| Native libraries | 44.4 MB | stored uncompressed (`useLegacyPackaging=false`) |
| Dex | 10.3 MB raw → 4.4 MB in APK | R8 minified |
| JS bundle | 3.45 MB | Hermes bytecode, stored uncompressed |
| Resources | 2.35 MB | includes 1.33 MB icon fonts actually used |
| `resources.arsc` | 1.44 MB | |
| Other | ~0.3 MB | |

Native libraries, grouped:

| Group | Size | % of libs |
|---|---|---|
| **Mapbox** (`mapbox-maps` 12.6 + `mapbox-common` 6.4) | **19.0 MB** | 43% |
| RN engine (`reactnative`, Hermes, JSI, c++_shared, fbjni, tooling) | 11.4 MB | 26% |
| Expo modules (core, appmodules, sqlite, v2, jsi) | 6.4 MB | 14% |
| Reanimated + Worklets | 2.9 MB | 7% |
| Image stack (AVIF 0.9, transcoder 0.6, WebP 0.5, GIF 0.6, filters 0.3) | 2.9 MB | 7% |
| RN codegen libs (screens 1.2, gesture-handler 0.4, safe-area 0.2) | 1.9 MB | 4% |
| zstd (from `expo` core) | 0.7 MB | 2% |

So **Mapbox alone is 34% of the release APK**, and the RN/Expo runtime is another ~32%.

### JS bundle — 3.45 MB Hermes (6.8 MB source)

`react-native` 2.15 MB, `expo-router` 1.29 MB, Supabase 0.83 MB, app code 0.25 MB,
`@rnmapbox/maps` 0.24 MB, TanStack Query 0.22 MB, everything else ~1.8 MB.

The bundle does **not** contain Reanimated, Worklets, Gesture Handler or Drawer Layout.

## Why an APK is 100+ MB

1. **Debug variant.** R8 is off (64 MB dex vs 10 MB), native libs are debug builds (89 MB vs 44 MB),
   and the dev client adds its own UI, fonts and MLKit barcode models.
2. **Universal APK.** A release APK with all four ABIs multiplies the native payload by ~3.2×.
   x86/x86_64 exist only for emulators, so a chunk of that APK is never used on a phone.
3. **Uncompressed native libs.** The SDK 58 template sets `expo.useLegacyPackaging=false`, which
   stores `.so` files uncompressed in the APK (fast install, large file).

## Recommendations (ranked by impact / effort)

### 1. Ship AAB, or build per-ABI APKs (no code change, biggest single win)

`production` already uses `buildType: "app-bundle"` — Play splits per device. The problem is
`preview`, which builds an APK with all four ABIs. Limit preview APKs to arm64 (and armv7 if you
still support 32-bit phones):

```ts
// app.config.ts, inside the expo-build-properties plugin
android: {
  ...(process.env.EAS_BUILD_PROFILE === 'preview'
    ? { buildArchs: ['arm64-v8a'] }        // or ['arm64-v8a', 'armeabi-v7a']
    : {}),
},
```

Expected: universal ~180 MB → **55.5 MB** for arm64 (arm64+armv7 ≈ 85–90 MB raw). Production AAB
is unaffected and already delivers ~25–27 MB per device.

### 2. Compress native libs and the JS bundle in APK builds

Measured on the release APK: libs 44.4 MB → **16 MB** with gzip, bundle 3.45 MB → **1.44 MB**.
That turns 55.5 MB into **~26 MB**.

```ts
// Only for APK profiles. Keep AAB defaults (uncompressed libs, faster install).
...(process.env.EAS_BUILD_PROFILE === 'preview' ? {
  buildArchs: ['arm64-v8a'],
  useLegacyPackaging: true,       // expo.useLegacyPackaging
  enableBundleCompression: true,  // android.enableBundleCompression
} : {}),
```

Trade-off: the OS extracts libraries at install time, so install takes slightly longer and
on-device size is unchanged; download/APK size is what shrinks. Not recommended for the Play AAB.

### 3. Replace Mapbox with Google Maps (only if the product can accept it)

Mapbox maps + common = **19 MB** (34% of the release APK; ~74 MB across four ABIs) and there is no
equivalent `.so` cost with Google Maps — the renderer lives in Play Services. `expo-maps` (Google
provider) or `react-native-maps` would remove ~17–19 MB per ABI.

The code is already set up for a swap: `src/core/maps/delivery-map.tsx` is provider-neutral and
`src/core/maps/geocoding.ts` calls Mapbox over HTTP (can stay). Trade-offs: Google Maps API key +
billing, Play Services required, different styling/offline story, and Apple Maps on iOS unless you
force the Google provider.

Expected: 55.5 MB → **~37 MB** raw, ~26 MB → **~19 MB** compressed.

### 4. Remove unused Reanimated + Worklets (and optionally Gesture Handler)

None of the three apps import `react-native-reanimated`, `react-native-worklets` or
`react-native-gesture-handler`; none of them appear in the JS bundle; Expo Router lists all three as
**optional** peers; the UI uses RN `Animated` and native-stack/native-tab navigation.

Release cost today: Reanimated 1.59 + Worklets 1.29 = **2.9 MB** (debug builds showed 14 MB, which
overstates the release impact). Removing them also lets you drop the
`-keep class com.swmansion.reanimated.**` rule in `android/app/proguard-rules.pro`.
Test navigation transitions/gestures afterwards.

### 5. Smaller, low-risk wins

| Change | Saving |
|---|---|
| `enableShrinkResourcesInReleaseBuilds: true` (R8 minify is already on) | ~0.3–0.8 MB |
| `gifEnabled: false`, `webpEnabled: false` (no RN `Image` imports; all images use `expo-image`) | ~1.1 MB/ABI |
| Replace `expo-sqlite/kv-store` with `expo-secure-store` (it currently stores the Supabase session, so this is also a security win) | ~1.9 MB/ABI |
| Remove unused `expo-device` (customer app) | <0.1 MB |

Do **not** disable the icon fonts: Ionicons (381 KB) is used by `src/ui/Icon.tsx` and Material
Symbols (949 KB) by the `NativeTabs.Trigger.Icon md=...` icons.

## Expected outcome

| Configuration | APK |
|---|---|
| Debug, arm64 (today) | 118.2 MB |
| Release, arm64 (today) | 55.5 MB |
| Release, universal (today, estimate) | ~180 MB |
| Release, arm64 + compression | **~26 MB** |
| + remove Reanimated/Worklets | ~25 MB |
| + Google Maps instead of Mapbox | **~18–20 MB** |
| Play AAB download (today, estimate) | ~25–27 MB |
| Play AAB download after all (estimate) | ~16–18 MB |

Non-arm64 ABI and Play numbers are estimates derived from the per-ABI Mapbox artifacts and RN's
prebuilt `.so` sizes; the arm64 figures are measured.

## What not to spend time on

- **App code/assets.** 828 KB of source, 636 KB of assets; only ~0.4 MB of app images/fonts reach the
  APK. `logo-glow.png` (324 KB) and `tutorial-web.png` (60 KB) are not referenced and are not bundled.
- **`expo-dev-client`.** Release builds stub the launcher: its classes occupy 296 bytes and MLKit /
  dev-menu fonts are debug-only. It is not the reason release APKs are big.
- **Hermes / new architecture.** Already the smaller/faster path. Disabling Hermes would add JSC.
- **R8.** Already enabled by the SDK 58 template (`android.enableMinifyInReleaseBuilds=true`).
- **The 118 MB debug APK itself.** Use a preview build for testers who do not need Metro.

## How to verify

```bash
# Local release APK for one ABI
cd customer-app/android && ./gradlew app:assembleRelease -PreactNativeArchitectures=arm64-v8a

# Inspect
unzip -l app/build/outputs/apk/release/app-release.apk
~/Library/Android/sdk/cmdline-tools/latest/bin/apkanalyzer dex packages --defined-only <apk>

# Real artifact
cd customer-app && eas build -p android --profile preview
```

Apply the same `expo-build-properties` changes to all three apps so preview builds stay consistent.
