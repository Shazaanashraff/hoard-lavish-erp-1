-- ============================================================
-- Cleanup: merge duplicate categories/brands.
--
-- Root cause (fixed in app code alongside this migration): addCategory /
-- addBrand created a local optimistic record with a client-generated id,
-- but db.insertCategory / db.insertBrand never sent that id to Supabase —
-- so Postgres generated its own id for the row. Background reconciliation
-- then merged local vs. remote records BY ID, so the two never matched up
-- and both survived, showing the same name twice in the UI.
--
-- categories.name / brands.name already have a UNIQUE constraint (migration
-- 001), so two ACTIVE rows can only coexist server-side if their names
-- differ by case or surrounding whitespace (the constraint is case-sensitive;
-- the app's own duplicate check is not). This migration finds and merges
-- those. It does NOT fix the purely client-side half of the bug — that's a
-- local-cache artifact per device, addressed separately by deduping the
-- displayed name list in services/localTagStore.ts.
--
-- Safe to re-run: only acts on rows where duplicates currently exist.
-- ============================================================

DO $$
DECLARE
  dup RECORD;
  keeper RECORD;
BEGIN
  FOR dup IN
    SELECT lower(trim(name)) AS norm_name
    FROM categories
    WHERE deleted_at IS NULL
    GROUP BY lower(trim(name))
    HAVING count(*) > 1
  LOOP
    -- Keep the oldest row (by updated_at, then id) as the canonical one.
    SELECT * INTO keeper FROM categories
      WHERE deleted_at IS NULL AND lower(trim(name)) = dup.norm_name
      ORDER BY updated_at ASC, id ASC
      LIMIT 1;

    -- Re-point any products/expenses referencing a losing duplicate's exact
    -- name string to the keeper's name before that row is tombstoned.
    UPDATE products SET category = keeper.name
      WHERE category IN (
        SELECT name FROM categories
        WHERE deleted_at IS NULL AND lower(trim(name)) = dup.norm_name AND id <> keeper.id
      );
    UPDATE expenses SET category = keeper.name
      WHERE category IN (
        SELECT name FROM categories
        WHERE deleted_at IS NULL AND lower(trim(name)) = dup.norm_name AND id <> keeper.id
      );

    UPDATE categories SET deleted_at = now(), updated_at = now()
      WHERE deleted_at IS NULL AND lower(trim(name)) = dup.norm_name AND id <> keeper.id;
  END LOOP;
END $$;

DO $$
DECLARE
  dup RECORD;
  keeper RECORD;
BEGIN
  FOR dup IN
    SELECT lower(trim(name)) AS norm_name
    FROM brands
    WHERE deleted_at IS NULL
    GROUP BY lower(trim(name))
    HAVING count(*) > 1
  LOOP
    SELECT * INTO keeper FROM brands
      WHERE deleted_at IS NULL AND lower(trim(name)) = dup.norm_name
      ORDER BY updated_at ASC, id ASC
      LIMIT 1;

    UPDATE products SET brand = keeper.name
      WHERE brand IN (
        SELECT name FROM brands
        WHERE deleted_at IS NULL AND lower(trim(name)) = dup.norm_name AND id <> keeper.id
      );

    UPDATE brands SET deleted_at = now(), updated_at = now()
      WHERE deleted_at IS NULL AND lower(trim(name)) = dup.norm_name AND id <> keeper.id;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
