# Nexus Weight — Deployment & Android Build

Fast digital weight register for fruit markets, traders, commission agents and mandi operators.

## Stack

React + TypeScript + Tailwind v4 · Supabase (Auth, Postgres, Realtime) · Dexie (IndexedDB offline) · Zustand · React Query · pdf-lib · html-to-image · Capacitor (Android)

## Database (Supabase Postgres)

Tables (all with `is_deleted` soft-delete + `created_at`/`updated_at`):

- `profiles` — user profile
- `parties` — traders/agents (name, phone, place)
- `vakkals` — vakkal/source (name, code)
- `caret_types` — crate/box types (name, tare_weight)
- `loads` — a weighing session (party_id, vakkal_id, caret_type_id, fruit, label, status)
- `entries` — individual weights (load_id, party_id, vakkal_id, seq, weight)

Row Level Security enabled: every table isolates rows by `auth.uid() = user_id`.

## API layer (Vercel serverless, `/api`)

`parties`, `vakkals`, `caret_types`, `loads`, `entries`, `history` — all verify the Supabase JWT and scope writes to the authenticated user. Soft deletes only; historical records are permanent.

## Offline-first sync engine

- Dexie mirrors all data in IndexedDB for instant reads.
- Every mutation writes locally first, then enqueues a task in `syncQueue`.
- `initSyncEngine()` flushes the queue on `online` events and every 15s.
- Supabase Realtime pushes multi-user changes for `loads` and `entries`.

## Web deployment

Already deployed to Vercel. Environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, service role key) are configured.

Demo login: `demo@nexusweight.app` / `weigh1234`

## Android APK build (Capacitor)

```bash
# 1. Install native tooling
npm i @capacitor/android

# 2. Build the web bundle
npm run build

# 3. Add the Android platform (first time only)
npx cap add android

# 4. Sync web assets into the native project
npx cap sync android

# 5. Open in Android Studio to build a signed APK/AAB
npx cap open android
#    Build > Generate Signed Bundle / APK

# Or build a debug APK from the CLI:
cd android && ./gradlew assembleDebug
# APK output: android/app/build/outputs/apk/debug/app-debug.apk
```

`capacitor.config.ts` is preconfigured with appId `com.nexus.weight`, appName `Nexus Weight`, webDir `dist`.

## Performance

- Numeric-only fast-path weight entry (Enter saves, auto-clear, auto-refocus).
- Local-first reads keep the grid instant even with millions of rows.
- History queries are indexed by party/vakkal/date and limited/paginated server-side.
