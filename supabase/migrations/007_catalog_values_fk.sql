-- ============================================================================
-- Nexus Weight — catalog_values: add missing auth.users foreign key
-- ============================================================================
-- 006_catalog_values.sql created catalog_values.user_id as a plain uuid with
-- RLS but no FK — every other user-owned table (parties, loads, profiles)
-- has `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`.
-- Without it, deleting a user account leaves orphaned catalog_values rows
-- behind forever instead of being cleaned up automatically like every other
-- table. This was caught by testing: a deleted test user left exactly one
-- orphaned catalog_values row while its loads/profile rows cascaded away.
-- ============================================================================

ALTER TABLE public.catalog_values
  ADD CONSTRAINT catalog_values_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
