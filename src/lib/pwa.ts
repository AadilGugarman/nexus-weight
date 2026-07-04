import { isNative } from './platform';

/* ============================================================================
 * PWA lifecycle: service-worker registration + update prompt, and the
 * "Add to Home Screen" install prompt. Both are no-ops inside the native
 * Capacitor shell (isNative()) — that app is already installed and a
 * service worker gives it nothing but risk of stale-asset interference in
 * the WebView.
 * ========================================================================== */

type Listener = () => void;

/* ------------------------------ update prompt ----------------------------- */
const updateListeners = new Set<Listener>();
let updateAvailable = false;
let applyUpdateFn: ((reload?: boolean) => Promise<void>) | null = null;

function notifyUpdate() { updateListeners.forEach((fn) => fn()); }

export function isPwaUpdateAvailable(): boolean {
  return updateAvailable;
}

export function subscribePwaUpdate(fn: Listener): () => void {
  updateListeners.add(fn);
  return () => updateListeners.delete(fn);
}

/** Activates the new service worker and reloads the page on the new assets. */
export async function applyPwaUpdate(): Promise<void> {
  if (applyUpdateFn) await applyUpdateFn(true);
}

let swRegistered = false;

/** Registers the app-shell service worker (web/PWA target only). */
export async function registerPwa(): Promise<void> {
  if (swRegistered || isNative()) return;
  swRegistered = true;
  try {
    const { registerSW } = await import('virtual:pwa-register');
    applyUpdateFn = registerSW({
      immediate: true,
      onNeedRefresh() {
        updateAvailable = true;
        notifyUpdate();
      },
    });
  } catch (e) {
    console.warn('[pwa] service worker registration failed', e);
  }
}

/* --------------------- install prompt (Add to Home Screen) --------------------- */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const installListeners = new Set<Listener>();
function notifyInstall() { installListeners.forEach((fn) => fn()); }

export function subscribePwaInstall(fn: Listener): () => void {
  installListeners.add(fn);
  return () => installListeners.delete(fn);
}

function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
}

export function canInstallPwa(): boolean {
  return !isNative() && !isStandalone() && !!deferredPrompt;
}

/** True once the browser has confirmed the app is actually installed. */
export function isPwaInstalled(): boolean {
  return !isNative() && isStandalone();
}

export async function promptPwaInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;
  await deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  notifyInstall();
  return outcome === 'accepted';
}

let installListenerAttached = false;

export function initInstallPrompt(): void {
  if (installListenerAttached || isNative()) return;
  installListenerAttached = true;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notifyInstall();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notifyInstall();
  });
}
