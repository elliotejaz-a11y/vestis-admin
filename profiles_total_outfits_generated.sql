-- Run this in the Supabase SQL editor.
--
-- Adds an all-time outfit generation counter to profiles.
-- The counter increments when an outfit is saved and never decrements,
-- so deleted outfits still contribute to the total.
--
-- Backfill note: the UPDATE below seeds the counter from currently saved
-- outfits. Outfits that were already deleted before this migration cannot
-- be recovered — those users (e.g. Kellen) will start at their current
-- saved count, not their true all-time total. From this point forward
-- the counter will be accurate.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS total_outfits_generated integer NOT NULL DEFAULT 0;

-- Seed from currently saved outfits (best available approximation).
UPDATE profiles p
SET total_outfits_generated = (
  SELECT COUNT(*) FROM outfits o WHERE o.user_id = p.id
);

-- Atomic increment called by the app each time an outfit is saved.
CREATE OR REPLACE FUNCTION increment_total_outfits_generated(p_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE profiles
  SET total_outfits_generated = total_outfits_generated + 1
  WHERE id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION increment_total_outfits_generated(uuid)
  TO authenticated, service_role;
