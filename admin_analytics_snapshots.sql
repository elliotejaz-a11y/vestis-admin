-- Run this in the Supabase SQL editor to create the historical snapshots table.
-- The snapshot_date column has a UNIQUE constraint so upsert-on-conflict works correctly.

create table if not exists admin_analytics_snapshots (
  id                    uuid        primary key default gen_random_uuid(),
  snapshot_date         date        not null unique,
  total_downloads       integer     not null default 0,
  total_users           integer     not null default 0,
  users_added_item      integer     not null default 0,
  users_generated_outfit integer    not null default 0,
  total_items_added     integer     not null default 0,
  total_outfits_made    integer     not null default 0,
  created_at            timestamptz not null default now()
);

-- Optional: restrict access so only the service role (used by this admin app) can read/write.
alter table admin_analytics_snapshots enable row level security;

create policy "service role full access"
  on admin_analytics_snapshots
  for all
  using (true)
  with check (true);
