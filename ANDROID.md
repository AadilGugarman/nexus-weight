# Nexus Weight — Android Build Guide

Nexus Weight is a Capacitor-wrapped React app. This document covers building
signed **APK** and **AAB** artifacts and the native code paths.

## Toolchain (all aligned at Capacitor 7.6.7)

| Package            | Version |
| ------------------ | ------- |
| @capacitor/core    | 7.6.7   |
| @capacitor/cli     | 7.6.7   |
| @capacitor/android | 7.6.7   |

Native plugins installed:
`@capacitor/app`, `@capacitor/browser`, `@capacitor/filesystem`,
`@capacitor/share`, `@capacitor/status-bar`, `@capacitor/splash-screen`,
`@capacitor/preferences`, `@capacitor/network`.

## Prerequisites (build machine)

- **JDK 17** (`java -version`)
- **Android SDK** (via Android Studio) with `ANDROID_HOME` / `ANDROID_SDK_ROOT` set
- **Gradle** (bundled `./gradlew` wrapper is used)

## App identity

- Application ID: `com.nexus.weight`
- App name: `Nexus Weight`
- versionCode `1`, versionName `1.0` (bump in `android/app/build.gradle`)
- Custom URL scheme (deep links): `com.nexus.weight://`

## One-time setup

```bash
npm install
npm run build          # produces dist/
npx cap sync android   # copies web assets + plugins into android/
```

## Open in Android Studio

```bash
npm run android:open
```

## Command-line builds

```bash
# Debug APK (unsigned, installable for testing)
npm run android:apk:debug
#  -> android/app/build/outputs/apk/debug/app-debug.apk

# Release APK (requires signing config, see below)
npm run android:apk
#  -> android/app/build/outputs/apk/release/app-release.apk

# Release AAB for Google Play
npm run android:aab
#  -> android/app/build/outputs/bundle/release/app-release.aab
```

## Signing a release build

1. Generate a keystore (once):
   ```bash
   keytool -genkey -v -keystore android/nexus-weight.keystore \
           -alias nexus -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Copy `android/keystore.properties.example` → `android/keystore.properties`
   and fill in `storeFile`, `storePassword`, `keyAlias`, `keyPassword`.
   (This file is git-ignored.)
3. Run `npm run android:apk` or `npm run android:aab`. The Gradle config
   auto-detects `keystore.properties` and signs the release.

## Native code paths

The app detects the runtime via `Capacitor.isNativePlatform()` (`src/lib/platform.ts`)
and switches implementations:

| Feature                    | Web                      | Android (native)                                                              |
| -------------------------- | ------------------------ | ----------------------------------------------------------------------------- |
| **Google Drive backup**    | GIS token client         | in-app `Browser` OAuth implicit flow + deep link (`com.nexus.weight://drive`) |
| **PDF export**             | download via `<a>`       | write to Cache + native `Share` sheet                                         |
| **Image / WhatsApp share** | Web Share API / download | write to Cache + native `Share` sheet                                         |
| **Text share**             | `wa.me` link             | native `Share` sheet                                                          |
| **Print**                  | `window.print()`         | shares the generated PDF (OS print/share)                                     |

Native startup (`src/lib/nativeInit.ts`) sets the status bar, hides the splash
screen, and wires the hardware back button.

## Google OAuth redirect (native)

The OAuth proxy must redirect back to `com.nexus.weight://auth` (login) and
Google Cloud must allow `com.nexus.weight://drive` as a redirect URI for the
Drive `response_type=token` flow. The manifest declares the matching
`<intent-filter>` with `android:scheme="com.nexus.weight"`.

## File sharing (FileProvider)

`AndroidManifest.xml` registers `androidx.core.content.FileProvider` under
`${applicationId}.fileprovider`. `res/xml/file_paths.xml` exposes the cache and
files directories used by the Filesystem plugin so shared PDFs/images resolve to
`content://` URIs.
