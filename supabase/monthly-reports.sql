-- ---------------------------------------------------------------------------
-- MONTHLY CLIENT REPORTS
--
-- One row per client per month describing what happened: sent, skipped with a
-- reason, or failed with the provider's error. Reports go out unattended, so
-- this table is the only record of what reached a client and what did not.
--
-- The sent HTML is kept verbatim. When a client asks about a number six weeks
-- later, the answer has to be the email they actually received, not a report
-- regenerated from data that has since been re-synced.
-- ---------------------------------------------------------------------------
create table if not exists report_sends (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  month_key date not null,
  status text not null check (status in ('sent', 'skipped', 'failed')),
  reason text,
  recipient text,
  subject text,
  provider_id text,
  html text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  -- One row per client per month. A client skipped in an earlier run and fixed
  -- since should end up with one row saying what finally happened, rather than
  -- a pile of historical rejections to read past.
  unique (client_id, month_key)
);

create index if not exists report_sends_month_idx on report_sends (month_key desc, status);

alter table report_sends disable row level security;

-- ---------------------------------------------------------------------------
-- SCHEDULE: 09:00 UTC on the 1st of every month.
--
-- Requires pg_cron and pg_net, both available on Supabase. Run the two create
-- extension lines once; re-running the schedule is safe because it unschedules
-- any existing job of the same name first.
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Replace <PROJECT_REF> and <SERVICE_ROLE_KEY> before running this block.
-- The function is deployed with verify_jwt = true, and the service role key is
-- a key the gateway accepts, so this call clears verification without the
-- endpoint being open to anyone who finds the URL.
--
-- select cron.unschedule('monthly-client-reports')
--   where exists (select 1 from cron.job where jobname = 'monthly-client-reports');
--
-- select cron.schedule(
--   'monthly-client-reports',
--   '0 9 1 * *',
--   $$
--   select net.http_post(
--     url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/monthly-report',
--     headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
--     body    := '{}'::jsonb
--   );
--   $$
-- );
