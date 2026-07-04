-- ============================================================================
-- Nexus Weight — Per-entry catalog labels (Group Entry Mode)
-- ============================================================================
-- Until now, custom_field_1/2/3 lived only on `loads` — one classification
-- per load. This adds the same 3 fields to `entries`, so a single load can
-- mix multiple label values across its weighings (e.g. Vakkal A for some
-- weighings, Vakkal B for others), matching the "Group Entry Mode" workflow.
--
-- Backward compatible by construction: these are nullable, no backfill
-- needed. Existing entries simply have NULL here, and the app's grouping
-- logic (computeLabelGroups in loadStats.ts) falls back to the load's own
-- custom_field_1/2/3 whenever an entry doesn't carry its own value — so
-- every load created before this migration keeps summarizing exactly as it
-- did under the old single-value-per-load model.
-- ============================================================================

ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS custom_field_1 text,
  ADD COLUMN IF NOT EXISTS custom_field_2 text,
  ADD COLUMN IF NOT EXISTS custom_field_3 text;
