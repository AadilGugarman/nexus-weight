import supabase from "./supabase";
import { isNative } from "./platform";

const isMobile = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

function buildGoogleUrl(appName: string) {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const redirectUri = import.meta.env.VITE_GOOGLE_AUTH_PROXY;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey =
    import.meta.env.VITE_SUPABASE_ANON_KEY ??
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!clientId || !redirectUri || !supabaseUrl || !supabaseAnonKey) {
    console.warn("[google-auth] Missing env", {
      clientId: !!clientId,
      redirectUri: !!redirectUri,
      supabaseUrl: !!supabaseUrl,
      supabaseAnonKey: !!supabaseAnonKey,
    });
    return null;
  }
  // `native` flag tells the proxy to redirect back to our custom scheme.
  const state = btoa(
    JSON.stringify({
      origin: window.location.origin,
      appName,
      supabaseUrl,
      supabaseAnonKey,
      native: isNative(),
      scheme: "com.nexus.weight",
    }),
  );
  return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid%20email%20profile&prompt=select_account&state=${encodeURIComponent(state)}`;
}

async function applyTokens(data: {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
}) {
  if (data.access_token && data.refresh_token) {
    await supabase.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    });
  } else if (data.id_token) {
    await supabase.auth.signInWithIdToken({
      provider: "google",
      token: data.id_token,
    });
  } else {
    console.warn("[google-auth] No valid token found for applyTokens", data);
  }
}

/* ------------------------------------------------------------------ */
/* NATIVE (Android) OAuth via the in-app browser + deep-link callback. */
/* ------------------------------------------------------------------ */
async function signInNative(appName: string) {
  const url = buildGoogleUrl(appName);
  if (!url) {
    console.warn("[google-auth] Missing env");
    return;
  }

  const { Browser } = await import("@capacitor/browser");
  const { App } = await import("@capacitor/app");

  // Listen for the deep link the proxy sends back:
  //   com.nexus.weight://auth?google_id_token=...  (or access/refresh tokens)
  const sub = await App.addListener("appUrlOpen", async ({ url: incoming }) => {
    if (
      !incoming ||
      (incoming.indexOf("google_id_token") === -1 &&
        incoming.indexOf("id_token") === -1 &&
        incoming.indexOf("access_token") === -1)
    )
      return;
    try {
      const q = incoming.split("?")[1] || "";
      const params = new URLSearchParams(q);
      await applyTokens({
        id_token:
          params.get("google_id_token") || params.get("id_token") || undefined,
        access_token: params.get("access_token") || undefined,
        refresh_token: params.get("refresh_token") || undefined,
      });
    } catch (e) {
      console.error("[google-auth] native callback failed", e);
    } finally {
      await Browser.close().catch(() => {});
      cleanup();
    }
  });

  // If the user backs out of the in-app browser without completing sign-in,
  // the deep link never fires — clean up the listener here too so cancelled
  // attempts don't accumulate orphaned "appUrlOpen" subscriptions.
  const finishedSub = await Browser.addListener("browserFinished", () => cleanup());

  let cleaned = false;
  function cleanup() {
    if (cleaned) return;
    cleaned = true;
    sub.remove();
    finishedSub.remove();
  }

  await Browser.open({
    url,
    windowName: "_self",
    presentationStyle: "popover",
  });
}

/* ------------------------------------------------------------------ */
/* WEB OAuth via popup + postMessage.                                 */
/* ------------------------------------------------------------------ */
function signInWeb(appName: string) {
  const url = buildGoogleUrl(appName);
  if (!url) {
    console.warn("[google-auth] Missing env");
    return;
  }
  window.open(url, "google-auth", isMobile() ? "" : "width=500,height=600");
  const handler = async (event: MessageEvent) => {
    if (event.data?.type === "google-auth-denied") {
      window.removeEventListener("message", handler);
      return;
    }
    if (event.data?.type !== "google-auth-success") return;
    window.removeEventListener("message", handler);
    await applyTokens(event.data);
  };
  window.addEventListener("message", handler);
}

export function signInWithGoogle(appName = "Nexus Weight") {
  if (isNative()) {
    void signInNative(appName);
    return;
  }
  signInWeb(appName);
}

export async function handleGoogleRedirect() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("google_id_token") || params.get("id_token");
  if (!token) return;
  window.history.replaceState({}, "", window.location.pathname);
  const { error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token,
  });
  if (error) {
    console.error("[google-auth]", error.message);
    return;
  }
  try {
    window.close();
  } catch {
    /* window may not be closable */
  }
}
