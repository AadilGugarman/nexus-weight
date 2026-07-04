-- ============================================================================
-- Nexus Weight — Linked Values
-- ============================================================================
-- Lets any catalog value be linked to values from the business's next
-- configured label (e.g. Category "Mango" linked to Variety "Kesar" and
-- "Rajapuri"; Variety "Kesar" linked to Vakkal "A"/"B"/"C"). This is a plain
-- many-to-many relationship — a value can link to several values, and a
-- value can be linked from several different values (e.g. Grade "Premium"
-- linked from both Supari Type "White" and "Red").
--
-- No hierarchy "mode" is stored anywhere — the app filters Load Entry
-- pickers by these links only where they exist, and falls back to showing
-- every value for a field when the selected value has none, so a business
-- that never links anything keeps today's fully independent behavior.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.catalog_value_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  value_id uuid NOT NULL REFERENCES public.catalog_values(id),
  linked_value_id uuid NOT NULL REFERENCES public.catalog_values(id),
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---- RLS --------------------------------------------------------------
ALTER TABLE public.catalog_value_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS own_rows ON public.catalog_value_links;
CREATE POLICY own_rows ON public.catalog_value_links
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---- indexes ------------------------------------------------------------
-- Primary read pattern: "what is X linked to" (Entry-screen filtering, and
-- pre-checking the Link Values sheet), from either direction.
CREATE INDEX IF NOT EXISTS idx_catalog_value_links_value
  ON public.catalog_value_links (value_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_catalog_value_links_linked_value
  ON public.catalog_value_links (linked_value_id) WHERE is_deleted = false;

-- Prevents the same pair being linked twice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_value_links_unique_active
  ON public.catalog_value_links (value_id, linked_value_id) WHERE is_deleted = false;
