-- google_campaign_daily
--   Campaign grain, one row per client per campaign per day, every metric.
--   The Google Search report (/reports/google-search) reads THIS for its
--   totals, its daily chart and its per-client and per-campaign tables,
--   because campaign grain counts every campaign type. The keyword table only
--   holds what Search keywords did, and the moment a client runs a Performance
--   Max campaign the keyword total under-reports their spend in a direction
--   nobody would notice. The weekly roll-up in weekly_kpis was already read
--   from campaign grain for that reason; this is the daily, per-campaign
--   version of the same numbers, with clicks, impressions and value kept.
--
--   Written by the google-daily-sync function (upsert on client, date,
--   campaign). Re-read for the last 14 days every night, so conversions that
--   land late against the click day settle on their own.

create table if not exists google_campaign_daily (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  date date not null,
  customer_id text,
  campaign_id text not null,
  campaign_name text,
  campaign_type text,
  campaign_status text,
  impressions integer not null default 0,
  clicks integer not null default 0,
  cost numeric not null default 0,
  conversions numeric not null default 0,
  conversion_value numeric not null default 0,
  synced_at timestamptz not null default now(),
  unique (client_id, date, campaign_id)
);

create index if not exists google_campaign_daily_client_date_idx on google_campaign_daily (client_id, date desc);
create index if not exists google_campaign_daily_date_idx on google_campaign_daily (date desc);

-- Same posture as the other two Google tables while login is off.
alter table google_campaign_daily enable row level security;
drop policy if exists anon_open_while_login_off on google_campaign_daily;
create policy anon_open_while_login_off on google_campaign_daily for all to anon using (true) with check (true);
grant select, insert, update, delete on google_campaign_daily to anon, authenticated;
