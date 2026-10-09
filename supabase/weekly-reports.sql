-- ---------------------------------------------------------------------------
-- WEEKLY CLIENT REPORTS
--
-- Every Monday morning each client with ads running gets a short, plain
-- email: last week's spend, leads, impressions, click-through rate and cost
-- per lead, what each number means, and why the return on those leads
-- matters more than any of them. One row per client per week records what
-- went out (or why it did not), keeps the HTML verbatim, and carries a token
-- for the web copy of the report, where the client can tell us how many of
-- the leads turned into jobs. That answer is the one number the CRM cannot
-- read from an ad platform, and it is what turns next week's report from
-- "cost per lead" into "return".
-- ---------------------------------------------------------------------------

-- Per client: where the report goes (overrides the intake's contact email)
-- and whether it goes at all.
alter table clients add column if not exists report_email text;
alter table clients add column if not exists weekly_report_enabled boolean not null default true;

create table if not exists weekly_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  week_start date not null,
  week_end date not null,
  token text not null unique default encode(gen_random_bytes(18), 'hex'),
  -- sent, ready (built, email not set up or switched off), skipped, failed
  status text not null check (status in ('sent', 'ready', 'skipped', 'failed')),
  reason text,
  recipient text,
  subject text,
  provider_id text,
  model jsonb,
  html text,
  -- What the client told us about the week's leads, from the web copy.
  jobs_booked integer,
  revenue numeric,
  client_note text,
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, week_start)
);
create index if not exists weekly_reports_week_idx on weekly_reports (week_start desc, status);

-- Not open to the anon key: the web copy is read by token through the two
-- functions below, never by listing the table.
alter table weekly_reports enable row level security;
revoke all on weekly_reports from anon;
grant select, insert, update on weekly_reports to authenticated;

-- The web copy of one report, by its token. The token is the credential.
-- (dashboard_token came later, with supabase/client-dashboard.sql, so the
-- report page can link to the client's dashboard. On a project that already
-- has the older function, run client-dashboard.sql instead: a return-type
-- change needs the old one moved out of the way first.)
create or replace function weekly_report_load(p_token text)
returns table (
  client_name text,
  week_start date,
  week_end date,
  model jsonb,
  jobs_booked integer,
  revenue numeric,
  client_note text,
  answered_at timestamptz,
  dashboard_token text
)
language sql
security definer
set search_path = public
as $$
  select c.name, w.week_start, w.week_end, w.model, w.jobs_booked, w.revenue, w.client_note, w.answered_at, c.dashboard_token
  from weekly_reports w join clients c on c.id = w.client_id
  where w.token = p_token and length(p_token) >= 20
  limit 1;
$$;

-- The client's answer: how many of the week's leads became jobs, and for
-- how much. Both optional; a note on its own is fine.
create or replace function weekly_report_answer(p_token text, p_jobs integer, p_revenue numeric, p_note text)
returns boolean
language sql
security definer
set search_path = public
as $$
  update weekly_reports
  set jobs_booked = p_jobs,
      revenue = p_revenue,
      client_note = nullif(left(coalesce(p_note, ''), 1000), ''),
      answered_at = now(),
      updated_at = now()
  where token = p_token and length(p_token) >= 20
  returning true;
$$;

grant execute on function weekly_report_load(text) to anon, authenticated;
grant execute on function weekly_report_answer(text, integer, numeric, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- SCHEDULE: Monday 13:00 UTC (9am Eastern), covering the Monday-to-Sunday
-- week that just ended. The function is deployed with verify_jwt = true and
-- the gateway accepts the project's anon key, which is what the browser uses
-- too; the function itself does nothing a stranger could profit from (one
-- report per client per week, to the address on file).
-- ---------------------------------------------------------------------------
-- select cron.unschedule('weekly-client-reports')
--   where exists (select 1 from cron.job where jobname = 'weekly-client-reports');
-- select cron.schedule(
--   'weekly-client-reports',
--   '0 13 * * 1',
--   $$
--   select net.http_post(
--     url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/weekly-report',
--     headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY>","apikey":"<ANON_KEY>"}'::jsonb,
--     body    := '{}'::jsonb,
--     timeout_milliseconds := 120000
--   );
--   $$
-- );
