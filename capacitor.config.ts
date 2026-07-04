import type { CapacitorConfig } from '@capacitor/cli';
import 'dotenv/config';

// GoogleAuth (native Drive sign-in) needs the Web OAuth client ID baked into
// the native config at `cap sync` time — this file runs under Node, not Vite,
// so it can't read import.meta.env; dotenv loads the same .env instead.
const googleDriveClientId = process.env.VITE_GOOGLE_DRIVE_CLIENT_ID;

const config: CapacitorConfig = {
  appId: 'com.nexus.weight',
  appName: 'Nexus Weight',
  webDir: 'dist',
  // On device we load the bundled web assets from the local scheme.
  server: {
    androidScheme: 'https',
    // Allow the OAuth proxy + Google + Supabase over the network.
    cleartext: false,
    allowNavigation: [
      'accounts.google.com',
      '*.googleusercontent.com',
      'www.googleapis.com',
      '*.supabase.co',
    ],
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 900,
      backgroundColor: '#1c1207',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#1c1207',
      overlaysWebView: false,
    },
    // Native (Android) Google Drive backup sign-in — see src/lib/drive.ts.
    // Only drive.appdata is requested (least-privilege: app-private hidden
    // folder, not general Drive access). serverClientId is the same "Web
    // application" OAuth client already used by the web GIS flow; Android's
    // own attestation (package name + SHA-1) is registered separately in
    // Google Cloud Console and isn't referenced by ID here — see the setup
    // notes shared alongside this change for the exact keytool commands.
    GoogleAuth: {
      scopes: ['https://www.googleapis.com/auth/drive.appdata'],
      serverClientId: googleDriveClientId,
      forceCodeForRefreshToken: true,
    },
  },
};

export default config;
