import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => {
  const isProduction = mode === "production";
  const plugins = [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null, // registered manually in src/lib/pwa.ts (skipped on native/Capacitor)
      manifest: {
        id: "/",
        name: "Nexus Weight — Digital Weight Register",
        short_name: "Nexus Weight",
        description:
          "The fastest digital weight register for fruit markets, traders and mandi operators. Realtime sync, offline-first, zero-friction weight entry.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#1c1207",
        theme_color: "#1c1207",
        categories: ["business", "productivity", "utilities"],
        icons: [
          {
            src: "/pwa-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/pwa-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: isProduction
        ? {
            // Precache the built app shell only — Supabase API calls are never
            // matched by these globs (different origin), so live data is always
            // fetched fresh; the existing Dexie-based sync queue (src/lib/sync.ts)
            // is what actually provides offline read/write, not the SW cache.
            globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
            navigateFallback: "/index.html",
            navigateFallbackDenylist: [/^\/api\//],
            cleanupOutdatedCaches: true,
            runtimeCaching: [
              {
                // Google Identity Services script — cache it so the web Drive
                // backup flow's sign-in button still renders when offline.
                urlPattern: ({ url }) =>
                  url.origin === "https://accounts.google.com",
                handler: "StaleWhileRevalidate",
                options: {
                  cacheName: "gis-script",
                  expiration: { maxEntries: 4 },
                },
              },
            ],
          }
        : {
            // In dev mode, skip precaching to avoid glob warnings
            // (Vite doesn't write files to disk in dev)
            navigateFallback: "/index.html",
            navigateFallbackDenylist: [/^\/api\//],
          },
      // Serve a real manifest + dev service worker under `npm run dev` too —
      // otherwise the <link rel="manifest"> in index.html 404s/falls through
      // to Vite's SPA fallback (index.html), which the browser then fails to
      // parse as JSON ("Manifest: Syntax error").
      devOptions: { enabled: true, type: "module" },
    }),
  ];
  try {
    // @ts-expect-error — optional dev-tooling file, not part of this repo
    const m = await import("./.vite-source-tags.js");
    plugins.push(m.sourceTags());
  } catch {
    // .vite-source-tags.js is optional dev-only tooling — skip if absent
  }

  const env = loadEnv(mode, process.cwd(), ["VITE_", "NEXT_PUBLIC_"]);
  const processEnvDefines: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    processEnvDefines[`process.env.${key}`] = JSON.stringify(value);
  }

  return {
    plugins,
    envPrefix: ["VITE_", "NEXT_PUBLIC_"],
    define: processEnvDefines,
  };
});
