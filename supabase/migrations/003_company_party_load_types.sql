-- ============================================================================
-- Nexus Weight — Company Name / Party Type / Load Type persistence
-- ============================================================================
-- These three fields previously existed only client-side (company name in
-- localStorage; party/load classification in IndexedDB, explicitly excluded
-- from the sync payload). This migration adds the real columns so the app
-- can persist, sync, and back up all three.
-- ============================================================================

-- ---- profiles.company_name -------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS company_name text;

-- ---- parties.party_type -----------------------------------------------------
ALTER TABLE public.parties
  ADD COLUMN IF NOT EXISTS party_type text NOT NULL DEFAULT 'customer';

ALTER TABLE public.parties
  DROP CONSTRAINT IF EXISTS parties_party_type_check;
ALTER TABLE public.parties
  ADD CONSTRAINT parties_party_type_check CHECK (party_type IN ('customer', 'supplier'));

-- ---- loads.movement_type -----------------------------------------------------
ALTER TABLE public.loads
  ADD COLUMN IF NOT EXISTS movement_type text NOT NULL DEFAULT 'inward';

ALTER TABLE public.loads
  DROP CONSTRAINT IF EXISTS loads_movement_type_check;
ALTER TABLE public.loads
  ADD CONSTRAINT loads_movement_type_check CHECK (movement_type IN ('inward', 'outward'));

-- ---- indexes ------------------------------------------------------------
-- Both columns back a primary list-view filter (All/Customers/Suppliers,
-- All/Inward/Outward), always scoped to a single user and to non-deleted rows.
CREATE INDEX IF NOT EXISTS idx_parties_user_party_type
  ON public.parties (user_id, party_type) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_loads_user_movement_type
  ON public.loads (user_id, movement_type) WHERE is_deleted = false;

-- ---- RLS ------------------------------------------------------------------
-- No policy changes required: 001_enable_rls.sql's `own_rows` policy on
-- parties/loads (FOR ALL USING auth.uid() = user_id) and `own_profile` policy
-- on profiles (FOR ALL USING auth.uid() = id) already govern every column on
-- these tables, including the ones added here.
