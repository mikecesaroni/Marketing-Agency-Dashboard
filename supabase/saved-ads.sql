-- ---------------------------------------------------------------------------
-- SAVED AD RECIPES
--
-- The Studio already writes three PNGs per ad into the client-files bucket, but
-- a PNG cannot be edited: the hook, the colours and which photo was picked are
-- all gone once it is flattened. This stores the inputs beside the output so a
-- saved ad can be reopened and changed.
--
-- Keyed by the same millisecond stamp the image filenames use, which is what
-- ties a recipe to its three artboards.
-- ---------------------------------------------------------------------------
create table if not exists saved_ads (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  stamp text not null,

  badge text,
  hook text,
  offer_amount text,
  offer_detail text,
  subhead text,
  proof text,
  cta text,

  accent text,
  badge_color text,
  safe_mode text,
  hook_plate boolean default false,

  -- Storage paths, not URLs. A path survives a bucket rename; a public URL does
  -- not, and these have to still resolve months later.
  background_path text,
  logo_path text,

  created_at timestamptz default now(),
  unique (client_id, stamp)
);

create index if not exists saved_ads_client_idx on saved_ads (client_id, created_at desc);

alter table saved_ads disable row level security;

-- Added after the table shipped; safe on a fresh install too.
alter table saved_ads add column if not exists hook_plate boolean default false;
