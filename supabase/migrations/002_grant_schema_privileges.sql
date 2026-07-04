-- ============================================================================
-- Nexus Weight — Fix: missing base schema privileges
-- ============================================================================
-- Discovered while smoke-testing the Edge Functions: `service_role` (and by
-- extension anon/authenticated) had NO table-level GRANTs on public schema
-- objects at all — every query failed with `42501: permission denied`,
-- regardless of RLS. This is independent of RLS: Postgres checks object-level
-- GRANTs before RLS policies ever run, and BYPASSRLS (which service_role has)
-- only skips RLS — it does not imply a GRANT.
--
-- This restores Supabase's standard public-schema privilege bootstrap so:
--   - service_role (used by ctx.supabaseAdmin in Edge Functions) has full
--     access, consistent with it bypassing RLS.
--   - anon/authenticated (used by the browser client) get the standard grant;
--     the RLS policies from 001_enable_rls.sql are what actually restrict
--     them to their own rows — granting privileges here does not widen
--     access beyond what those policies already allow.
-- ============================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

-- Ensure the same applies to anything created after this migration too.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
