-- Per-ad, per-day Meta performance. Run once in the Supabase SQL Editor.
--
-- Daily grain on purpose: weekly and monthly rollups are both then exact.
-- Storing weekly rows would make month boundaries approximate, since weeks
-- straddle months.

create table if not exists ad_daily (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  ad_id text not null,
  ad_name text,
  campaign_id text,
  adset_id text,
  effective_status text,
  date date not null,

  spend numeric not null default 0,
  impressions integer not null default 0,
  reach integer not null default 0,
  clicks integer not null default 0,
  leads integer not null default 0,

  -- Video engagement. Null for image ads, which is a real distinction from
  -- zero — an image ad has no hook rate, it isn't a hook rate of 0.
  video_plays integer,
  video_2s_views integer,
  video_p25 integer,
  video_p50 integer,
  video_p75 integer,
  video_p100 integer,
  video_thruplays integer,
  video_avg_watch_seconds numeric,

  synced_at timestamptz not null default now()
);

-- Lets a re-sync overwrite a day rather than pile up duplicates.
create unique index if not exists ad_daily_client_ad_date_idx
  on ad_daily (client_id, ad_id, date);

create index if not exists ad_daily_client_date_idx on ad_daily (client_id, date);

alter table ad_daily disable row level security;
