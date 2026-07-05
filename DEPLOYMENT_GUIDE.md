# NEXUS WEIGHT — VERCEL DEPLOYMENT GUIDE

## Quick Start (5 Minutes)

### Step 1: Push to Git Repository
```bash
git add .
git commit -m "Production-ready: Bug fixes and optimizations"
git push origin main
```

### Step 2: Deploy to Vercel
1. Go to [vercel.com](https://vercel.com)
2. Click "New Project"
3. Import your Git repository
4. Configure project:
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Install Command:** `npm install`

### Step 3: Add Environment Variables
In Vercel project settings → Environment Variables, add:

```
VITE_SUPABASE_URL=https://izukczhjnbjktfwnwvpj.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_neoUw7tKuunDsdO05D26TQ_WCiFNenn
VITE_GOOGLE_DRIVE_CLIENT_ID=900141814199-96lmp4gc096ebnkrquk5o7846mo4n2sg.apps.googleusercontent.com
```

**Important:** Add to all environments (Production, Preview, Development)

### Step 4: Deploy
Click "Deploy" → Wait 2-3 minutes

Your production URL will be: `https://nexus-weight-[random].vercel.app`

### Step 5: Update Google OAuth
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Navigate to: APIs & Services → Credentials
3. Click your OAuth 2.0 Client ID
4. Add Vercel URL to:
   - **Authorized JavaScript origins:** `https://nexus-weight-[random].vercel.app`
   - **Authorized redirect URIs:** `https://nexus-weight-[random].vercel.app`
5. Save changes

---

## Post-Deployment Verification

### Critical Tests (Must Pass)

1. **Authentication**
   ```
   ✓ Navigate to /login
   ✓ Create account with access code
   ✓ Log out and log in
   ✓ Refresh page (should stay logged in)
   ```

2. **PWA Installation** (Mobile)
   ```
   ✓ Open on Chrome/Safari mobile
   ✓ See "Add to Home Screen" prompt
   ✓ Install and launch
   ✓ Works offline
   ```

3. **Core Features**
   ```
   ✓ Create load
   ✓ Add weight entries
   ✓ Finalize load
   ✓ Share via WhatsApp
   ✓ Export PDF
   ```

4. **Offline Sync**
   ```
   ✓ Disable network
   ✓ Add entries (should queue)
   ✓ Enable network (should sync)
   ```

---

## Troubleshooting

### Issue: "Missing Supabase environment variables"
**Solution:** Environment variables not added correctly in Vercel
1. Go to Vercel project → Settings → Environment Variables
2. Verify all 3 variables are added
3. Redeploy the project

### Issue: 404 on page refresh
**Solution:** vercel.json not deployed correctly
1. Verify `vercel.json` exists in root directory
2. Git commit and push
3. Vercel will auto-redeploy

### Issue: PWA not installing
**Solution:** HTTPS required for PWA
1. Ensure using Vercel's HTTPS URL (not http://)
2. Clear browser cache
3. Try on different browser

### Issue: Google Drive backup fails
**Solution:** OAuth origins not updated
1. Add Vercel URL to Google Cloud Console (Step 5 above)
2. Wait 5 minutes for propagation
3. Try again

### Issue: WhatsApp share shows error
**Solution:** Popup blocked
1. Allow popups in browser settings
2. Try again

---

## Custom Domain (Optional)

### Add Your Own Domain
1. In Vercel → Project Settings → Domains
2. Add domain: `app.yourcompany.com`
3. Follow DNS configuration instructions
4. Update Google OAuth origins with new domain

---

## Monitoring & Analytics

### Vercel Analytics (Recommended)
1. In Vercel → Project → Analytics tab
2. Click "Enable Vercel Analytics"
3. View real-time performance metrics

### Error Tracking
- Built-in Error Boundary catches React crashes
- Console errors logged to browser DevTools
- Supabase logs available in Supabase Dashboard

### Database Monitoring
1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select project: `izukczhjnbjktfwnwvpj`
3. Check:
   - Table Editor → Verify data
   - Logs → Check for errors
   - Database → Monitor storage usage

---

## Maintenance

### Database Cleanup (Before Client Handover)
See `PRODUCTION_CHECKLIST.md` → Section 9 for SQL commands to remove test data.

**⚠️ Important:** Execute cleanup ONLY after client confirms production data is backed up.

### Updating the App
1. Make code changes locally
2. Test with `npm run build`
3. Git commit and push
4. Vercel auto-deploys new version
5. Users see update banner after refresh

### Rollback (If Issues Found)
1. Vercel Dashboard → Deployments
2. Find previous stable deployment
3. Click "..." → "Promote to Production"
4. Issue fixed in ~30 seconds

---

## Client Training

### Access Code Management
Client needs to:
1. Generate access codes in Supabase
2. Share codes with new users
3. Monitor usage in `access_codes` table

**SQL to create access code:**
```sql
INSERT INTO public.access_codes (code, company_name, max_uses, is_active)
VALUES ('ABC123', 'My Company Name', 10, true);
```

### Viewing Client Data
Client can view data in Supabase Dashboard:
- **Table Editor** → Browse loads, entries, parties
- **SQL Editor** → Run custom queries
- **Authentication** → View user accounts

---

## Support Contacts

- **Vercel Support:** [vercel.com/support](https://vercel.com/support)
- **Supabase Support:** [supabase.com/support](https://supabase.com/support)
- **Developer:** [Your contact info]

---

## Success Metrics

After deployment, verify:
- ✅ No console errors on load
- ✅ All pages load < 3 seconds
- ✅ PWA installs successfully on mobile
- ✅ Offline mode works
- ✅ WhatsApp/PDF export works
- ✅ Backup/Restore to Google Drive works
- ✅ Multi-device sync works in real-time

---

## Production URL

After deployment, your production URL will be:
```
https://nexus-weight-[random].vercel.app
```

Or with custom domain:
```
https://app.yourcompany.com
```

Share this URL with client for testing.

---

## Next Steps

1. ✅ Complete Vercel deployment (Steps 1-5)
2. ✅ Run post-deployment verification tests
3. ✅ Share production URL with client
4. ⏳ Client testing (1-2 weeks)
5. ⏳ Address client feedback
6. ⏳ Production handover
7. ⏳ Remove test data (use cleanup script)

**Current Status: READY FOR DEPLOYMENT** 🚀
