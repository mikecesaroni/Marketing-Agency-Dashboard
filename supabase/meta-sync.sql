-- Meta Ads weekly sync — database side.
-- Run this in the Supabase SQL Editor. Steps 1 and 2 first; step 4 only after
-- the Edge Function is deployed.

-- 1. Where each client's Meta ad account ID lives. Numeric ID only, no "act_"
--    prefix — the function adds that itself.
alter table clients add column if not exists meta_ad_account_id text;

-- 2. Stops a re-run from duplicating a week.
--
--    IMPORTANT: this fails if you already have two rows for the same client,
--    week and channel — likely if you logged the same week twice by hand. Check
--    first:
--
--      select client_id, week_of, channel, count(*)
--      from weekly_kpis
--      group by 1, 2, 3
--      having count(*) > 1;
--
--    If that returns rows, collapse them before creating the index:
--
--      delete from weekly_kpis a using weekly_kpis b
--      where a.id > b.id
--        and a.client_id = b.client_id
--        and a.week_of = b.week_of
--        and a.channel = b.channel;
--
--    (That keeps the earliest row of each duplicate set and drops the others —
--    read the select output before running it.)

create unique index if not exists weekly_kpis_client_week_channel_idx
  on weekly_kpis (client_id, week_of, channel);

-- 3. Extensions needed to call the function on a schedule from Postgres.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 4. The daily schedule. RUN THIS ONLY AFTER deploying the Edge Function.
--
--    Replace <PROJECT_REF> with your project ref (the subdomain of your
--    Supabase URL) and <SERVICE_ROLE_KEY> with the service role key from
--    Settings -> API. That key is a full-access credential — it is safe here
--    because this runs inside your database, but never put it in the app.
--
--    Fires 06:00 UTC daily. Each run refreshes the week in progress and
--    re-checks last week, since Meta keeps attributing conversions for days
--    after they happen.

-- select cron.unschedule('sync-meta-kpis');  -- run first if rescheduling

-- select cron.schedule(
--   'sync-meta-kpis',
--   '0 6 * * *',
--   $$
--   select net.http_post(
--     url := 'https://<PROJECT_REF>.supabase.co/functions/v1/sync-meta-kpis',
--     headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
--     body := '{}'::jsonb
--   );
--   $$
-- );

-- Check what's scheduled:      select * from cron.job;
-- Check recent runs:           select * from cron.job_run_details order by start_time desc limit 10;

-- 5. Ad account picker.
-- The client page offers a dropdown of Meta ad accounts rather than asking for
-- a 16-digit ID by hand. The browser has no Meta credentials, so the list is
-- cached here and refreshed from a session that can reach Meta.

create table if not exists meta_ad_accounts (
  ad_account_id text primary key,
  name text,
  business_name text,
  synced_at timestamptz not null default now()
);

alter table meta_ad_accounts disable row level security;

-- ---------------------------------------------------------------------------
-- WHAT IS ACTUALLY SCHEDULED (added after finding cron.job empty)
--
-- Step 4 above was written as "run this only after deploying the Edge
-- Function", and then never run -- so for as long as this file has existed the
-- daily sync only happened when somebody pressed "Sync Now". The job below is
-- the one now live on the project.
--
-- It authenticates with the ANON key rather than the service role. The
-- function's gateway check is all this has to pass, it already uses the service
-- role internally for its own writes, and the anon key is public regardless --
-- it is the same credential the browser's Sync Now button sends. That also
-- means this block is safe to keep in the repo, which the service-role version
-- never was. That is probably why the original was left un-run.
-- ---------------------------------------------------------------------------
-- select cron.unschedule('meta-daily-sync')
--   where exists (select 1 from cron.job where jobname = 'meta-daily-sync');
--
-- select cron.schedule(
--   'meta-daily-sync',
--   '0 8 * * *',                     -- 08:00 UTC / 4am Eastern
--   $$
--   select net.http_post(
--     url := 'https://<PROJECT_REF>.supabase.co/functions/v1/sync-meta-kpis',
--     headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY>"}'::jsonb,
--     body := '{}'::jsonb,
--     timeout_milliseconds := 120000
--   );
--   $$
-- );
--
-- Check it:  select jobid, jobname, schedule, active from cron.job;
