-- ============================================================================
-- Nexus Weight — Configurable Business Labels (profiles)
-- ============================================================================
-- Every business can rename up to 3 free-text classification fields shown on
-- the Load Entry screen (e.g. a fruit trader: Category/Variety/Vakkal; a
-- supari trader: Supari Type/Variety/blank). A blank label hides its field
-- everywhere — it is never validated or required.
--
-- Existing rows are backfilled to the fruit-trader defaults so current users
-- see the same field set they already use today (Category/Variety/Vakkal),
-- with zero disruption. Only NULL values are touched, so this migration is
-- safe to run more than once and never overwrites a value a user already set.
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS custom_label_1 text;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS custom_label_2 text;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS custom_label_3 text;

UPDATE public.profiles SET custom_label_1 = 'Category' WHERE custom_label_1 IS NULL;
UPDATE public.profiles SET custom_label_2 = 'Variety'  WHERE custom_label_2 IS NULL;
UPDATE public.profiles SET custom_label_3 = 'Vakkal'   WHERE custom_label_3 IS NULL;

-- ---- RLS ------------------------------------------------------------------
-- No policy changes required: 001_enable_rls.sql's `own_profile` policy
-- (FOR ALL USING auth.uid() = id) already governs every column on this table,
-- including the ones added here.
