-- Run this in the Supabase SQL editor.
--
-- These functions replace direct table selects in the admin dashboard.
-- The raw queries (SELECT user_id FROM clothing_items) hit PostgREST's
-- default 1,000-row cap, silently truncating results and producing
-- incorrect zero counts for users whose rows fall beyond the limit.
-- SECURITY DEFINER bypasses RLS; the functions return one row per user
-- so the row-limit issue cannot recur regardless of scale.

CREATE OR REPLACE FUNCTION admin_clothing_item_counts()
RETURNS TABLE(user_id uuid, item_count bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id, COUNT(*)::bigint AS item_count
  FROM clothing_items
  GROUP BY user_id;
$$;

CREATE OR REPLACE FUNCTION admin_outfit_counts()
RETURNS TABLE(user_id uuid, outfit_count bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id, COUNT(*)::bigint AS outfit_count
  FROM outfits
  GROUP BY user_id;
$$;

-- Grant execute to the roles the Supabase JS client uses.
GRANT EXECUTE ON FUNCTION admin_clothing_item_counts() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION admin_outfit_counts() TO authenticated, anon, service_role;
