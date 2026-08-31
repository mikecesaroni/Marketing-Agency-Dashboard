-- ---------------------------------------------------------------------------
-- IS THE CLIENT'S ADVERTISING ACTUALLY RUNNING?
--
-- Summit Water Pros' card payment failed. Meta left the ad account unsettled
-- over an unpaid $3.04, and the ads stopped. Nothing in the CRM said so: the
-- client was still flagged meta_ads_active, the dashboard still counted them
-- among the live accounts, and the only evidence was an ABSENCE -- spend that
-- stopped arriving -- which no view was looking for. They paid for a month of
-- advertising that did not run.
--
-- Two signals, because each catches what the other misses.
-- ---------------------------------------------------------------------------

-- 1. Meta's own verdict on the account, written nightly by the
--    meta-account-health Edge Function.
--
-- That function does two other jobs for the same reason -- Meta facts that go
-- stale silently and that nobody should have to refresh by hand:
--
--   * It refreshes meta_ad_accounts, the cache behind the ad-account dropdown.
--     NOTHING had ever written that table. Seven rows went in by hand in
--     August 2026 and it froze there, so Belk, Pillar and Reliable were each
--     connected to an account the dropdown could not offer -- which looked
--     like the picker being broken.
--   * It fills in meta_page_id and meta_pixel_id for any connected client
--     missing them, from the Page the account's own creatives post as. That
--     used to be a "Detect from Meta" button, which is a button whose only job
--     is to ask Meta something Meta already knows.
--
-- account_status 1 is ACTIVE; anything else means ads are not delivering.
--
-- The balance is stored with it because it is the actual instruction. "Ad
-- account unsettled" sends someone digging through Ads Manager; "unsettled,
-- $3.04 outstanding" is a thing to go and pay.
--
-- disable_reason is only set when Meta actively DISABLES an account. Reading
-- the live accounts showed 0 on one that was merely unsettled, so the status
-- carries the explanation and the reason is extra detail when present.
alter table clients
  add column if not exists meta_account_status integer,
  add column if not exists meta_disable_reason integer,
  add column if not exists meta_account_balance numeric,
  add column if not exists meta_account_checked_at timestamptz;

-- 2. Spend that stopped, which catches everything the account status never
--    mentions: every campaign paused, a budget spent, a creative rejected, an
--    ad set out of schedule.
--
-- Aggregated in the database because PostgREST cannot group, and the dashboard
-- should not pull every ad-day row to produce one number per client.
create or replace view client_ad_delivery as
select
  client_id,
  max(date) filter (where spend > 0) as last_spend_date,
  coalesce(sum(spend) filter (where date >= current_date - 7), 0) as spend_7d,
  coalesce(sum(spend) filter (where date >= current_date - 30), 0) as spend_30d
from ad_daily
group by client_id;

comment on view client_ad_delivery is
  'Last day each client''s ads spent anything, plus recent totals. Feeds the '
  'dashboard alert for ads that have gone quiet.';

-- ---------------------------------------------------------------------------
-- SCHEDULE
--
-- 08:20 UTC, twenty minutes after meta-daily-sync, so ad_daily is already
-- fresh when the dashboard reads the account status and the spend history
-- together.
--
-- Deliberately a separate function and a separate job from the KPI sync. This
-- is one cheap field read per account and has nothing to do with aggregating
-- insights; losing a day of spend and leads because an account-status call
-- failed would be a bad trade. It also meant the sync, which carries all the
-- performance data, never had to be reopened to add this.
--
-- Same anon-key pattern as meta-daily-sync: the key only has to pass the
-- gateway, the function uses the service role for its own writes, and the anon
-- key is public regardless -- which is what makes this block safe to keep here.
-- ---------------------------------------------------------------------------
-- select cron.unschedule('meta-account-health')
--   where exists (select 1 from cron.job where jobname = 'meta-account-health');
--
-- select cron.schedule(
--   'meta-account-health',
--   '20 8 * * *',
--   $$
--   select net.http_post(
--     url := 'https://<project>.supabase.co/functions/v1/meta-account-health',
--     headers := '{"Content-Type":"application/json","Authorization":"Bearer <anon key>"}'::jsonb,
--     body := '{}'::jsonb,
--     timeout_milliseconds := 120000
--   );
--   $$
-- );

-- Check what is scheduled:  select jobname, schedule, active from cron.job;
-- Check recent runs:        select * from cron.job_run_details order by start_time desc limit 10;
