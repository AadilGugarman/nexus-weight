-- ============================================================================
-- Nexus Weight — Tare weight system + Load status (Draft/Finalized)
-- ============================================================================
-- Tare: container_count × weight_per_container = total tare, subtracted from
-- the sum of entry weights (gross) to get net. Both are plain numeric inputs
-- captured at load creation; the app computes totals from them rather than
-- storing a redundant precomputed tare column that could drift.
--
-- Status: the existing `status` column already exists (default 'open', no
-- constraint, never actually used by the app). Repurposed here as the
-- Draft/Finalized lock state: 'open' rows are remapped to 'draft' (same
-- meaning — actively editable) and a CHECK constraint is added so only
-- these two values are ever valid going forward.
-- ============================================================================

ALTER TABLE public.loads
  ADD COLUMN IF NOT EXISTS container_count numeric,
  ADD COLUMN IF NOT EXISTS weight_per_container numeric;

UPDATE public.loads SET status = 'draft' WHERE status IS DISTINCT FROM 'finalized';

ALTER TABLE public.loads ALTER COLUMN status SET DEFAULT 'draft';

ALTER TABLE public.loads DROP CONSTRAINT IF EXISTS loads_status_check;
ALTER TABLE public.loads
  ADD CONSTRAINT loads_status_check CHECK (status IN ('draft', 'finalized'));

-- ---- Hard lock: no entry insert/update on a finalized load -----------------
-- The app already disables entry editing in the UI once a load is
-- finalized, but that alone is client-side only — a stale tab, a queued
-- offline sync task, or a future bug could still write through. This
-- trigger makes the lock a real guarantee at the data layer: any INSERT or
-- UPDATE on `entries` for a finalized load is rejected outright. Unlocking
-- only ever happens by setting the load back to 'draft' first (the explicit
-- "Edit Load" action), which this trigger does not touch.
-- Deleting a load itself must still be able to cascade-soft-delete its
-- entries even when finalized (deleteLoad sets loads.is_deleted=true first,
-- then soft-deletes its entries) — only block edits on a finalized load
-- that is still active, not cleanup of one that's being removed entirely.
CREATE OR REPLACE FUNCTION public.enforce_load_not_finalized()
RETURNS trigger AS $$
DECLARE
  load_status text;
  load_deleted boolean;
BEGIN
  SELECT status, is_deleted INTO load_status, load_deleted
    FROM public.loads WHERE id = COALESCE(NEW.load_id, OLD.load_id);
  IF load_status = 'finalized' AND load_deleted IS NOT TRUE THEN
    RAISE EXCEPTION 'Cannot modify entries: load % is finalized', COALESCE(NEW.load_id, OLD.load_id)
      USING ERRCODE = '23514';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_entries_lock_finalized ON public.entries;
CREATE TRIGGER trg_entries_lock_finalized
  BEFORE INSERT OR UPDATE ON public.entries
  FOR EACH ROW EXECUTE FUNCTION public.enforce_load_not_finalized();
