-- Client dashboards.
--
-- One private link per client (/dashboard/<token>) that shows every number
-- we have for them: spend, leads, cost per lead, impressions, clicks and
-- click rate for the last 7, 30 or 90 days against the period before, by
-- day and by channel, their best ads, what each number means and why the
-- return on the leads matters more than cost per lead. The token in the
-- link is the credential. The page reads through client_dashboard_load,
-- which is the only thing the anon key can reach; nothing on the page can
-- change anything.
--
-- Run this whole file in the SQL editor. Safe to re-run.

-- 1. The token. Every client gets one; "New link" in the CRM replaces it,
--    so an old link stops working.
alter table clients add column if not exists dashboard_token text;
update clients set dashboard_token = encode(gen_random_bytes(18), 'hex') where dashboard_token is null;
alter table clients alter column dashboard_token set default encode(gen_random_bytes(18), 'hex');
create unique index if not exists clients_dashboard_token_idx on clients (dashboard_token);

-- 2. Everything the dashboard shows, in one call.
--    days:  one row per day for the last 180 days (90 days plus the 90
--           before, for the comparison), Meta and Google side by side.
--    ads:   one row per ad (or Google campaign) per window (7, 30, 90 days).
--    weeks: the weekly reports that were built, with the client's answers.
--    lsa:   the LSA weeks logged by hand, when there are any.
create or replace function client_dashboard_load(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with c as (
    select id, name, industry, market, meta_ad_account_id, google_ads_customer_id
    from clients
    where dashboard_token = p_token and length(p_token) >= 20 and archived = false
    limit 1
  ),
  m as (
    select date, sum(spend) as spend, sum(leads) as leads, sum(impressions) as impressions, sum(clicks) as clicks
    from ad_daily
    where client_id = (select id from c) and date >= current_date - 180
    group by date
  ),
  g as (
    select date, sum(cost) as spend, sum(conversions) as leads, sum(impressions) as impressions, sum(clicks) as clicks
    from google_campaign_daily
    where client_id = (select id from c) and date >= current_date - 180
    group by date
  ),
  d as (
    select coalesce(m.date, g.date) as date,
      coalesce(m.spend, 0) as meta_spend, coalesce(m.leads, 0) as meta_leads, coalesce(m.impressions, 0) as meta_impressions, coalesce(m.clicks, 0) as meta_clicks,
      coalesce(g.spend, 0) as google_spend, coalesce(g.leads, 0) as google_leads, coalesce(g.impressions, 0) as google_impressions, coalesce(g.clicks, 0) as google_clicks
    from m full join g on m.date = g.date
  ),
  r as (
    select ad_id as key, ad_name as name, 'meta' as channel, date, spend, leads::numeric as leads, impressions, clicks
    from ad_daily
    where client_id = (select id from c) and date >= current_date - 89
    union all
    select campaign_id, campaign_name, 'google', date, cost, conversions, impressions, clicks
    from google_campaign_daily
    where client_id = (select id from c) and date >= current_date - 89
  ),
  ads as (
    select r.key, max(r.name) as name, r.channel, win.w,
      sum(r.spend) as spend, sum(r.leads) as leads, sum(r.impressions) as impressions, sum(r.clicks) as clicks
    from r cross join (values (7), (30), (90)) as win(w)
    where r.date >= current_date - (win.w - 1)
    group by r.key, r.channel, win.w
  ),
  w as (
    select week_start, week_end, token, status,
      coalesce((model->'totals'->>'spend')::numeric, 0) as spend,
      coalesce((model->'totals'->>'leads')::numeric, 0) as leads,
      coalesce((model->'totals'->>'cpl')::numeric, 0) as cpl,
      jobs_booked, revenue, answered_at
    from weekly_reports
    where client_id = (select id from c) and status in ('sent', 'ready')
    order by week_start desc
    limit 16
  ),
  lsa as (
    select week_of, ad_spend as spend, leads
    from weekly_kpis
    where client_id = (select id from c) and channel = 'LSA' and week_of >= current_date - 180
  )
  select case when (select id from c) is null then null else jsonb_build_object(
    'client', (select jsonb_build_object('name', name, 'industry', industry, 'market', market) from c),
    'channels', (select jsonb_build_object('meta', meta_ad_account_id is not null, 'google', google_ads_customer_id is not null) from c),
    'avg_job_value', (select average_job_value from onboarding_intake where client_id = (select id from c) limit 1),
    'generated_at', now(),
    'last_day', (select max(date) from d where meta_spend > 0 or google_spend > 0),
    'first_day', (select min(date) from d where meta_spend > 0 or google_spend > 0),
    'days', coalesce((select jsonb_agg(to_jsonb(d) order by d.date) from d), '[]'::jsonb),
    'ads', coalesce((select jsonb_agg(to_jsonb(ads)) from ads), '[]'::jsonb),
    'weeks', coalesce((select jsonb_agg(to_jsonb(w) order by w.week_start desc) from w), '[]'::jsonb),
    'lsa', coalesce((select jsonb_agg(to_jsonb(lsa) order by lsa.week_of) from lsa), '[]'::jsonb)
  ) end;
$$;

revoke all on function client_dashboard_load(text) from public;
grant execute on function client_dashboard_load(text) to anon, authenticated;

-- 2b. The business name behind a link, for the preview a message app shows
--     ("KPI Dashboard for Belk Heating and Cooling"). Returns the name and
--     nothing else; see netlify/edge-functions/client-preview.ts.
create or replace function client_link_name(p_kind text, p_token text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_kind = 'dashboard' then (select name from clients where dashboard_token = p_token and archived = false and length(p_token) >= 20 limit 1)
    when p_kind = 'report' then (select c.name from weekly_reports w join clients c on c.id = w.client_id where w.token = p_token and length(p_token) >= 20 limit 1)
    else null
  end;
$$;
revoke all on function client_link_name(text, text) from public;
grant execute on function client_link_name(text, text) to anon, authenticated;

-- 3. The weekly report page links to the dashboard, so its loader carries
--    the token too. A return-type change cannot be done in place: the old
--    function is renamed out of the way, the new one created, the old one
--    dropped at the end. (The rename rather than a drop first is so the
--    file also runs through tools that hold DROP statements for a
--    confirmation.)
alter function weekly_report_load(text) rename to weekly_report_load_v1;
create function weekly_report_load(p_token text)
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
revoke all on function weekly_report_load_v1(text) from public, anon, authenticated;
grant execute on function weekly_report_load(text) to anon, authenticated;
drop function if exists weekly_report_load_v1(text);
