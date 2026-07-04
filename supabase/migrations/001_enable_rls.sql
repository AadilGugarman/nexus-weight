-- ============================================================================
-- Nexus Weight — Security Migration: ENABLE ROW LEVEL SECURITY
-- ============================================================================
-- IMPORTANT: The policies below already exist, but RLS ENFORCEMENT must be
-- turned on per-table. Run this in the Supabase SQL editor (or via psql) ONCE.
--
-- Until RLS is ENABLED, the anon key can read tables directly through
-- PostgREST. API routes already enforce per-user + access-code checks, but
-- enabling RLS closes the direct-PostgREST hole. This is REQUIRED for
-- production.
-- ============================================================================

-- ---- Company access-code tables: secret, no client access at all ----------
ALTER TABLE public.access_codes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_codes       FORCE ROW LEVEL SECURITY;
ALTER TABLE public.authorized_users   ENABLE ROW LEVEL SECURITY;

-- Deny every client (anon + authenticated) from reading access_codes.
DROP POLICY IF EXISTS deny_all_client_access ON public.access_codes;
CREATE POLICY deny_all_client_access ON public.access_codes
  FOR SELECT USING (false);

-- authorized_users: a user may read only their own authorization row.
DROP POLICY IF EXISTS deny_all_client_reads ON public.authorized_users;
CREATE POLICY own_authorization ON public.authorized_users
  FOR SELECT USING (auth.uid() = user_id);

-- ---- Per-user data tables: users may only touch their own rows ------------
ALTER TABLE public.parties      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fruits       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.varieties    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caret_types  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loads        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entries      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles     ENABLE ROW LEVEL SECURITY;

-- The owner-only policies (auth.uid() = user_id) already exist for these
-- tables; enabling RLS above activates them. Recreate defensively:
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['parties','fruits','varieties','caret_types','loads','entries']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS own_rows ON public.%I;', t);
    EXECUTE format(
      'CREATE POLICY own_rows ON public.%I FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);',
      t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS own_profile ON public.profiles;
CREATE POLICY own_profile ON public.profiles
  FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- NOTE: All server API routes use the SERVICE ROLE key, which BYPASSES RLS,
-- so the app keeps working exactly as before — but the public anon key can no
-- longer read anything directly.
