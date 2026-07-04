/* Google Drive backup using the user's own free 15GB storage.
 * Web: Google Identity Services token client. Native (Android/iOS): the
 * platform Google Sign-In SDK via @codetrix-studio/capacitor-google-auth.
 * Both paths end up with a bearer access token used against the Drive REST
 * API below. Data is stored in the hidden `appDataFolder` (invisible to the
 * user, only accessible by this app) so it never clutters their Drive.
 */

import { isNative } from "./platform";

const SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const BACKUP_NAME = "nexus-weight-backup.json";

/** Minimal shape of the Google Identity Services token client (loaded via
 * the <script src="https://accounts.google.com/gsi/client"> tag in
 * index.html) — only the surface this file actually calls. */
interface GisTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}
interface GisTokenClient {
  requestAccessToken: () => void;
}
interface GisOAuth2 {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    prompt: string;
    callback: (resp: GisTokenResponse) => void;
  }) => GisTokenClient;
  revoke: (token: string, callback: () => void) => void;
}
declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GisOAuth2 } };
  }
}

let cachedToken: { token: string; exp: number } | null = null;

function clientId() {
  return import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_ID as string;
}

async function waitForGIS(timeout = 8000): Promise<GisOAuth2> {
  const start = Date.now();
  while (!window.google?.accounts?.oauth2) {
    if (Date.now() - start > timeout)
      throw new Error("Google Sign-In library not loaded");
    await new Promise((r) => setTimeout(r, 100));
  }
  return window.google.accounts.oauth2;
}

/* Native Drive token via the platform Google Sign-In SDK (Android/iOS),
 * requesting the drive.appdata scope directly — no custom-scheme redirect
 * involved. Google does not allow custom URI-scheme redirects for "Web
 * application" OAuth clients (the deep-link flow this replaced would fail
 * with `redirect_uri_mismatch` in production); the native SDK instead
 * attests the app via its package name + SHA-1 signing fingerprint,
 * registered as a separate "Android" OAuth client in the same Google Cloud
 * project — see the setup notes shared alongside this change. */
async function getDriveTokenNative(interactive: boolean): Promise<string> {
  const { GoogleAuth } = await import("@codetrix-studio/capacitor-google-auth");
  await GoogleAuth.initialize();

  // Silent (auto-backup) requests use refresh() so they never surface UI;
  // an interactive Connect/Backup Now tap uses signIn(), which shows the
  // account picker / consent screen the first time.
  const accessToken = interactive
    ? (await GoogleAuth.signIn()).authentication.accessToken
    : (await GoogleAuth.refresh()).accessToken;
  if (!accessToken) throw new Error("Google Sign-In did not return a Drive access token");

  // Google access tokens are valid ~1h; refresh 5 minutes early to be safe.
  cachedToken = { token: accessToken, exp: Date.now() + 55 * 60_000 };
  return accessToken;
}

/** Request a Drive access token (opens Google consent the first time). */
export async function getDriveToken(interactive = true): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now() + 30_000)
    return cachedToken.token;

  if (isNative()) return getDriveTokenNative(interactive);

  const oauth2 = await waitForGIS();
  return new Promise<string>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId(),
      scope: SCOPE,
      prompt: interactive ? "" : "none",
      callback: (resp: {
        access_token?: string;
        expires_in?: number;
        error?: string;
      }) => {
        if (resp.error || !resp.access_token)
          return reject(new Error(resp.error || "No token"));
        cachedToken = {
          token: resp.access_token,
          exp: Date.now() + (resp.expires_in || 3600) * 1000,
        };
        resolve(resp.access_token);
      },
    });
    try {
      client.requestAccessToken();
    } catch (e) {
      reject(e as Error);
    }
  });
}

export function hasDriveScope(): boolean {
  return !!(cachedToken && cachedToken.exp > Date.now());
}

async function driveFetch(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`https://www.googleapis.com/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
  });
  if (!res.ok) throw new Error(`Drive API ${res.status}: ${await res.text()}`);
  return res;
}

/** Find the existing backup file id (or null). */
async function findBackupId(token: string): Promise<string | null> {
  const res = await driveFetch(
    token,
    `drive/v3/files?spaces=appDataFolder&fields=files(id,name,modifiedTime)&q=${encodeURIComponent(`name='${BACKUP_NAME}'`)}`,
  );
  const data = await res.json();
  return data.files?.[0]?.id || null;
}

export interface BackupMeta {
  modifiedTime: string;
  size: number;
}

export async function getBackupMeta(token: string): Promise<BackupMeta | null> {
  const res = await driveFetch(
    token,
    `drive/v3/files?spaces=appDataFolder&fields=files(id,modifiedTime,size)&q=${encodeURIComponent(`name='${BACKUP_NAME}'`)}`,
  );
  const data = await res.json();
  const f = data.files?.[0];
  if (!f) return null;
  return { modifiedTime: f.modifiedTime, size: Number(f.size || 0) };
}

/** Upload (create or overwrite) the backup JSON. */
export async function uploadBackup(
  token: string,
  snapshot: unknown,
): Promise<void> {
  const existingId = await findBackupId(token);
  const boundary = "nexusweight" + Math.random().toString(36).slice(2);
  const metadata = existingId
    ? { name: BACKUP_NAME }
    : { name: BACKUP_NAME, parents: ["appDataFolder"] };
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(snapshot)}\r\n` +
    `--${boundary}--`;

  const method = existingId ? "PATCH" : "POST";
  const url = existingId
    ? `upload/drive/v3/files/${existingId}?uploadType=multipart`
    : `upload/drive/v3/files?uploadType=multipart`;
  await driveFetch(token, url, {
    method,
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
}

/** Download and parse the backup JSON (or null if none). */
export async function downloadBackup(token: string): Promise<unknown | null> {
  const id = await findBackupId(token);
  if (!id) return null;
  const res = await driveFetch(token, `drive/v3/files/${id}?alt=media`);
  return res.json();
}

export function signOutDrive() {
  if (isNative()) {
    void import("@codetrix-studio/capacitor-google-auth")
      .then(({ GoogleAuth }) => GoogleAuth.signOut())
      .catch(() => {
        /* noop — best-effort revoke */
      });
  } else if (cachedToken) {
    try {
      window.google?.accounts?.oauth2?.revoke(cachedToken.token, () => {});
    } catch {
      /* noop */
    }
  }
  cachedToken = null;
}
