# NEXUS WEIGHT — PRODUCTION DEPLOYMENT CHECKLIST

## Pre-Deployment Verification

### 1. Environment Variables (Vercel)
- [ ] Add `VITE_SUPABASE_URL` to Vercel environment variables
- [ ] Add `VITE_SUPABASE_PUBLISHABLE_KEY` to Vercel environment variables
- [ ] Add `VITE_GOOGLE_DRIVE_CLIENT_ID` to Vercel environment variables

### 2. Google Cloud Console
- [ ] Add Vercel production URL to OAuth 2.0 Authorized JavaScript origins
- [ ] Add Vercel production URL to OAuth 2.0 Authorized redirect URIs
- [ ] Format: `https://your-app.vercel.app`

### 3. Supabase Configuration
- [ ] Verify all migrations are applied (run in SQL Editor):
  ```sql
  SELECT * FROM supabase_migrations.schema_migrations ORDER BY version;
  ```
- [ ] Verify RLS is enabled on all tables:
  ```sql
  SELECT schemaname, tablename, rowsecurity 
  FROM pg_tables 
  WHERE schemaname = 'public' 
  ORDER BY tablename;
  ```
- [ ] Verify Edge Functions are deployed:
  - [ ] `authorize` function deployed
  - [ ] `validate-code` function deployed

### 4. Build Verification
- [ ] Run `npm run build` — should succeed without errors
- [ ] Check dist/ folder exists with:
  - [ ] index.html
  - [ ] manifest.webmanifest
  - [ ] sw.js
  - [ ] All PWA icons (pwa-192.png, pwa-512.png, maskable-512.png)

## Post-Deployment Testing

### Authentication Flow
- [ ] Navigate to `/login`
- [ ] Click "Sign up"
- [ ] Enter invalid access code → Should show error
- [ ] Enter valid access code + email + password → Should create account
- [ ] Log out
- [ ] Log in with created account → Should redirect to dashboard
- [ ] Refresh page → Should stay logged in

### Load Management
- [ ] Create new draft load
- [ ] Add weight entries (5-10 entries)
- [ ] Verify entries appear in real-time
- [ ] Edit an entry weight → Should update
- [ ] Delete an entry → Should remove and show undo toast
- [ ] Finalize load → Should lock entries
- [ ] Try to edit finalized load → Should show unlock confirmation

### Dynamic Labels & Catalog
- [ ] Go to Manage → Configuration
- [ ] Set Label 1 = "Category", Label 2 = "Variety", Label 3 = "Grade"
- [ ] Save → Should sync across devices
- [ ] Go to Manage → Catalogs
- [ ] Add Category value (e.g., "Mango")
- [ ] Add Variety value under Mango (e.g., "Kesar")
- [ ] Go to Entry page
- [ ] Verify Active Tag Bar shows configured labels
- [ ] Select Category + Variety → Add entries
- [ ] Verify entries group by selected tags

### Offline Functionality
- [ ] Disable network (DevTools → Network → Offline)
- [ ] Create a party → Should queue to sync
- [ ] Add weight entries → Should save locally
- [ ] Re-enable network → Should auto-sync
- [ ] Verify sync diagnostics show 0 pending

### Export & Sharing
- [ ] Finalize a load with entries
- [ ] Click "Share Load"
- [ ] Test WhatsApp → Should generate PNG and open wa.me link
- [ ] Test PDF Export → Should download/share PDF
- [ ] Test Print → Should open print dialog
- [ ] Verify all fields render correctly (party, vehicle, labels, weights)

### PWA Installation (Mobile)
- [ ] Open app on mobile browser (Chrome/Safari)
- [ ] Should show "Add to Home Screen" prompt
- [ ] Install app
- [ ] Open installed app → Should launch in standalone mode
- [ ] Verify splash screen shows
- [ ] Test offline → App should work without network
- [ ] Go online → Should sync queued changes

### Backup & Restore
- [ ] Go to Backup page
- [ ] Click "Connect to Google Drive" → Should OAuth
- [ ] Click "Backup Now" → Should upload to Drive
- [ ] Create test data (party, load)
- [ ] Click "Restore from Drive" → Should restore previous state
- [ ] Verify test data is replaced with backup data

### Realtime Sync (Multi-Device)
- [ ] Open app on Device A
- [ ] Open app on Device B (same account)
- [ ] Create party on Device A → Should appear on Device B
- [ ] Add entry on Device B → Should appear on Device A
- [ ] Verify sync happens within 2-3 seconds

### History & Search
- [ ] Create 3-4 loads with different parties
- [ ] Go to History page
- [ ] Search by vehicle number → Should filter
- [ ] Search by party name → Should filter
- [ ] Filter by "Inward" → Should show only inward loads
- [ ] Filter by "Finalized" → Should show only finalized loads
- [ ] Test pagination → Should load next page

### Theme System
- [ ] Open Settings (header icon)
- [ ] Change theme (Indigo → Forest) → Should apply instantly
- [ ] Change mode (Dark → Light) → Should apply instantly
- [ ] Refresh page → Theme should persist

## Known Limitations (Documented, Not Bugs)

1. **Bundle Size Warning** — Main chunk is 825 KB (249 KB gzipped). This is acceptable but could be optimized further in future releases.

2. **No Test Coverage** — E2E tests not yet implemented. Manual testing required for each release.

3. **Drive Backup Requires Browser Popup** — If popup blocked, user must allow popups manually.

4. **WhatsApp Share on Web** — Opens wa.me link + downloads PNG. User must manually attach PNG to WhatsApp message.

5. **PWA Update Requires Manual Reload** — Update banner appears but requires user to click "Update available" button.

## Emergency Rollback

If critical issues are discovered post-deployment:

1. In Vercel dashboard → Deployments → Find previous stable deployment
2. Click "..." → "Promote to Production"
3. Notify client of rollback and issue being investigated

## Support Contacts

- **Developer:** [Your contact]
- **Supabase Project:** izukczhjnbjktfwnwvpj.supabase.co
- **Vercel Project:** [Will be created on first deploy]
