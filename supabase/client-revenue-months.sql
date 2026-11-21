-- Revenue from leads, month by month, logged by the client on their dashboard.
--
-- 2026-11-21: "dial in the revenue tracker on client dashboards. I want them
-- to be able to track how much revenue leads are bringing in each month."
--
-- The dashboard already had a place for this, fed by the client answering
-- the weekly report. Nobody ever did: 96 reports, no answers, because the
-- question lived behind an email. This puts the question on the dashboard
-- itself, once a month, as two numbers: how many of the leads became jobs,
-- and what those jobs were worth.
--
--   client_revenue_months   one row per client per month. A month with no row
--                           has not been logged. Zero jobs and $0 is a real
--                           answer ("none of them booked"), not a blank.
--   client_revenue_save     the only way the dashboard writes. The token in
--                           the link is the credential, as it is for reading.
--
-- The dashboard reads the months back through client_dashboard_load
-- (supabase/client-dashboard.sql), which also adds up any weekly answers for
-- a month the client has not logged directly.
--
-- Safe to run more than once.

create table if not exists public.client_revenue_months (
  client_id uuid not null references public.clients(id) on delete cascade,
  -- The first day of the month.
  month date not null,
  jobs integer not null default 0,
  revenue numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (client_id, month),
  constraint client_revenue_months_first_day check (month = date_trunc('month', month)::date),
  constraint client_revenue_months_sane check (jobs >= 0 and revenue >= 0)
);

alter table public.client_revenue_months enable row level security;

-- The team reads and corrects it in the CRM. The anon key cannot touch the
-- table at all: a client's page goes through the two functions.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'client_revenue_months' and policyname = 'staff_all'
  ) then
    create policy staff_all on public.client_revenue_months
      for all to authenticated using (true) with check (true);
  end if;
end $$;

-- Saves one month for the client whose dashboard link this is. Returns the
-- saved month, or null when the link is not a live client's.
create or replace function public.client_revenue_save(p_token text, p_month date, p_jobs integer, p_revenue numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid;
  m date;
begin
  select id into cid from clients
  where dashboard_token = p_token and length(p_token) >= 20 and archived = false
  limit 1;
  if cid is null then
    return null;
  end if;

  m := date_trunc('month', p_month)::date;
  -- This month can be logged "so far". A month that has not started cannot,
  -- and nothing older than three years is a typo worth keeping.
  if m is null or m > date_trunc('month', current_date)::date or m < (date_trunc('month', current_date) - interval '36 months')::date then
    raise exception 'That month cannot be logged.';
  end if;
  if p_jobs is null or p_jobs < 0 or p_jobs > 100000 or p_revenue is null or p_revenue < 0 or p_revenue > 100000000 then
    raise exception 'Those numbers do not look right.';
  end if;

  insert into client_revenue_months (client_id, month, jobs, revenue)
  values (cid, m, p_jobs, round(p_revenue, 2))
  on conflict (client_id, month) do update
    set jobs = excluded.jobs, revenue = excluded.revenue, updated_at = now();

  return jsonb_build_object('month', m, 'jobs', p_jobs, 'revenue', round(p_revenue, 2));
end $$;

revoke all on function public.client_revenue_save(text, date, integer, numeric) from public;
grant execute on function public.client_revenue_save(text, date, integer, numeric) to anon, authenticated;
