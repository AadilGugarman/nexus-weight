-- ============================================================================
-- Nexus Weight — Generic Catalog System
-- ============================================================================
-- Replaces the fixed fruits/varieties/caret_types entities with a single
-- generic table backing whichever of the business's 3 configurable fields
-- (profiles.custom_label_1/2/3) are in use. loads.custom_field_1/2/3 remain
-- plain text (no schema change) — catalog_values is purely the autocomplete/
-- "create on the fly" suggestion source behind the Load Entry search dropdown,
-- exactly mirroring how fruits/varieties previously worked but generically.
--
-- The old fruits/varieties/caret_types tables and loads.vakkal_id/
-- caret_type_id/fruit columns are NOT dropped here — the app no longer reads
-- or writes them, but removing them from the database is a separate,
-- irreversible step left for an explicit follow-up migration.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.catalog_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  field_number smallint NOT NULL CHECK (field_number IN (1, 2, 3)),
  value text NOT NULL,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---- RLS --------------------------------------------------------------
ALTER TABLE public.catalog_values ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS own_rows ON public.catalog_values;
CREATE POLICY own_rows ON public.catalog_values
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---- indexes ------------------------------------------------------------
-- Primary read pattern: "all active values for this user's field N",
-- feeding the search dropdown on the Load Entry screen.
CREATE INDEX IF NOT EXISTS idx_catalog_values_user_field
  ON public.catalog_values (user_id, field_number) WHERE is_deleted = false;

-- Prevents case-insensitive duplicates among active values per field (e.g.
-- "Mango" and "mango" both existing), while still allowing a value to be
-- re-added after a prior entry with the same text was soft-deleted.
CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_values_unique_active
  ON public.catalog_values (user_id, field_number, lower(value)) WHERE is_deleted = false;
