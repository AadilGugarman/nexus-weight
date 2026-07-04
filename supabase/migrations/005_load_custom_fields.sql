-- ============================================================================
-- Nexus Weight — Configurable Business Labels (loads)
-- ============================================================================
-- Stores the free-text values entered on the Load Entry screen for whichever
-- of the business's 3 custom labels (profiles.custom_label_1/2/3) are
-- configured. These are plain nullable text columns: a load created before
-- this migration simply has NULL in all three, which the app already renders
-- as "not set" — no backfill, no constraint, no data loss for existing loads.
-- ============================================================================

ALTER TABLE public.loads
  ADD COLUMN IF NOT EXISTS custom_field_1 text;
ALTER TABLE public.loads
  ADD COLUMN IF NOT EXISTS custom_field_2 text;
ALTER TABLE public.loads
  ADD COLUMN IF NOT EXISTS custom_field_3 text;

-- ---- RLS ------------------------------------------------------------------
-- No policy changes required: 001_enable_rls.sql's `own_rows` policy on loads
-- (FOR ALL USING auth.uid() = user_id) already governs every column on this
-- table, including the ones added here.
