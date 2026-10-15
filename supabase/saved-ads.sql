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
-- "Send to Meta library": the image hashes Meta gave back per size, and when.
alter table saved_ads add column if not exists meta_image_hashes jsonb;
alter table saved_ads add column if not exists meta_library_at timestamptz;
-- Season label: spring, summer, fall, winter, holiday or all (src/lib/adSeason.js).
alter table saved_ads add column if not exists season text;

-- 2026-10-14: a panel behind the subhead only (the Studio's "Panel" choice).
alter table saved_ads add column if not exists subhead_plate boolean default false;

-- 2026-10-15: the second photo of a before-and-after static, and the look itself.
alter table saved_ads add column if not exists background_path_2 text;
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'saved_ads_layout_check') then
    execute 'alter table saved_ads drop constraint saved_ads_layout_check';
  end if;
  execute 'alter table saved_ads add constraint saved_ads_layout_check check (layout = any (array[''cover'',''card'',''stack'',''plate'',''split'',''before'',''ai'']))';
end $$;
