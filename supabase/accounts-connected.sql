-- When an ad account was connected, and which campaigns are the client's own.
-- Applied 2026-11-03; safe to run twice.
--
-- "Coelho we haven't had any live ads yet." Their Google account was
-- connected on November 2 carrying a search campaign that had been spending
-- since October 6; the sync pulled the history and the brief read "No leads
-- in 8 days of ads". The CRM now knows WHEN each account was connected
-- (stamped by a trigger whenever the id changes to a new one, and on
-- insert), and a view lists every campaign that was already spending before
-- that day: the client's own, not ours. src/lib/ourAds.js drops those rows
-- from the flags, the "live on Google" check and the weekly status.
--
-- A client with no stamp (connected before this existed) has no legacy
-- campaigns and everything counts. To treat a client's old campaign as ours
-- (we took it over instead of building new), clear the stamp:
--   update clients set google_ads_connected_at = null where id = '...';

alter table public.clients add column if not exists meta_connected_at timestamptz;
alter table public.clients add column if not exists google_ads_connected_at timestamptz;

create or replace function public.stamp_accounts_connected()
returns trigger
language plpgsql
as $$
begin
  if new.meta_ad_account_id is not null and (tg_op = 'INSERT' or new.meta_ad_account_id is distinct from old.meta_ad_account_id) then
    new.meta_connected_at := now();
  end if;
  if new.google_ads_customer_id is not null and (tg_op = 'INSERT' or new.google_ads_customer_id is distinct from old.google_ads_customer_id) then
    new.google_ads_connected_at := now();
  end if;
  return new;
end;
$$;

create or replace trigger clients_stamp_accounts_connected
  before insert or update of meta_ad_account_id, google_ads_customer_id on public.clients
  for each row execute function public.stamp_accounts_connected();

-- The stamps for accounts connected since the channel started hearing about
-- them (team_digests kind 'account', 2026-10-28 on). Only where the account
-- on the client is still the one that was announced. Express Home Services
-- is left out on purpose: its Google campaign ran from September 29 under
-- our own naming, before the CRM was connected to it on October 28, so it
-- is ours and must keep counting.
update public.clients c set meta_connected_at = t.first_told
from (
  select split_part(subject, ':', 2)::uuid as client_id, split_part(subject, ':', 4) as account_id, min(created_at) as first_told
  from public.team_digests where kind = 'account' and split_part(subject, ':', 3) = 'meta' group by 1, 2
) t
where t.client_id = c.id and c.meta_ad_account_id = t.account_id and c.meta_connected_at is null
  and c.name <> 'Express Home Services llc';

update public.clients c set google_ads_connected_at = t.first_told
from (
  select split_part(subject, ':', 2)::uuid as client_id, split_part(subject, ':', 4) as account_id, min(created_at) as first_told
  from public.team_digests where kind = 'account' and split_part(subject, ':', 3) = 'google' group by 1, 2
) t
where t.client_id = c.id and regexp_replace(coalesce(c.google_ads_customer_id, ''), '\D', '', 'g') = t.account_id and c.google_ads_connected_at is null
  and c.name <> 'Express Home Services llc';

-- Every campaign that was spending before the day its account was
-- connected: the client's own. Read by statusRows, weeklyRows and
-- pipelineRows through src/lib/ourAds.js.
create or replace view public.legacy_ad_campaigns as
select g.client_id, 'google'::text as channel, g.campaign_id::text as campaign_id
from public.google_campaign_daily g join public.clients c on c.id = g.client_id
where c.google_ads_connected_at is not null and g.cost > 0 and g.campaign_id is not null
  and g.date < (c.google_ads_connected_at at time zone 'America/New_York')::date
group by g.client_id, g.campaign_id
union all
select a.client_id, 'meta'::text, a.campaign_id::text
from public.ad_daily a join public.clients c on c.id = a.client_id
where c.meta_connected_at is not null and a.spend > 0 and a.campaign_id is not null
  and a.date < (c.meta_connected_at at time zone 'America/New_York')::date
group by a.client_id, a.campaign_id;

grant select on public.legacy_ad_campaigns to anon, authenticated, service_role;
