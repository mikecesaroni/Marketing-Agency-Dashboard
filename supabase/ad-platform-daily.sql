-- Where each ad actually ran, and what it cost there.
--
-- ad_daily answers "how did this ad do"; this answers "how did it do on
-- Instagram Stories versus the Facebook feed", which is the question behind
-- every "should we keep making Stories crops" conversation. Verified against
-- the live API before building it: publisher_platform and platform_position
-- both return real splits for these accounts.
--
-- Sparse on purpose. Meta only returns a row where something was delivered, so
-- a client running feed-only writes six rows a week rather than sixty empty
-- ones.
create table if not exists public.ad_platform_daily (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  ad_id text not null,
  date date not null,
  -- facebook, instagram, audience_network, threads, messenger, unknown.
  -- Stored as Meta spells it rather than mapped to a friendlier name: the
  -- names are Meta's vocabulary and a rename here would only have to be
  -- undone when a new surface appears.
  platform text not null,
  -- feed, facebook_reels, instagram_stories, marketplace, right_hand_column...
  position text not null,
  spend numeric default 0,
  impressions integer default 0,
  clicks integer default 0,
  leads integer default 0,
  synced_at timestamptz default now(),
  -- The sync re-runs the current week every night and last week too, so every
  -- write is an upsert on the row's natural identity.
  unique (client_id, ad_id, date, platform, position)
);

-- The two reads this table exists for: one client's recent split, and one ad's.
create index if not exists ad_platform_daily_client_date_idx
  on public.ad_platform_daily (client_id, date desc);
create index if not exists ad_platform_daily_ad_idx
  on public.ad_platform_daily (ad_id, date desc);
