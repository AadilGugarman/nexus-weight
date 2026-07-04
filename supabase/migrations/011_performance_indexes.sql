-- ============================================================================
-- Nexus Weight — Performance indexes
-- ============================================================================
-- entries had zero indexes at all despite being filtered by user_id/is_deleted/
-- load_id on every screen and batch-joined via .in(load_id, ...) in getHistory.
-- loads only had an index pairing user_id with movement_type; the actual hot
-- path (list/sort by created_at, filter by party_id or status) had nothing.
-- parties had no index on its own sort column (name).
-- All indexes are partial (WHERE is_deleted = false) to match the soft-delete
-- filter every query already applies, keeping them small and cheap to update.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_entries_load_id
  ON public.entries (load_id) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_entries_user_created
  ON public.entries (user_id, created_at) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_loads_user_created
  ON public.loads (user_id, created_at DESC) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_loads_party
  ON public.loads (party_id) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_loads_status
  ON public.loads (status) WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_parties_user_name
  ON public.parties (user_id, name) WHERE is_deleted = false;
