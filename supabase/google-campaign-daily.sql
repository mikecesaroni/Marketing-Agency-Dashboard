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

-- clients.google_ads_synced_at / clients.google_ads_sync_error
--   How the last Google sync went for this client, written by the sync
--   function after each client. A saved customer id with an error here means
--   Google refused us (the client has not added us as a user or linked to the
--   manager yet), which the report and the client page show as "No access"
--   rather than as an account that simply had no spend.
alter table clients add column if not exists google_ads_synced_at timestamptz;
alter table clients add column if not exists google_ads_sync_error text;

-- weekly_kpis.channel took only 'Meta' and 'LSA', so the sync's weekly
-- 'Google Search' roll-up was refused (and read as "Google refused us" in the
-- CRM). Applied 2026-09-29 as migration weekly_kpis_google_channel.
alter table weekly_kpis drop constraint if exists weekly_kpis_channel_check;
alter table weekly_kpis add constraint weekly_kpis_channel_check check (channel in ('Meta', 'LSA', 'Google Search'));
