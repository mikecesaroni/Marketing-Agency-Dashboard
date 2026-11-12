-- Local Services Ads through the Google Ads API (2026-11-12): "go ahead and
-- build the LSA KPI pull and do whatever you see as best for seeing LSA data
-- and who's connected, who's not, etc, KPIs".
--
-- What the CRM already had: the nightly google-daily-sync reads EVERY
-- campaign type in a connected Google Ads account into google_campaign_daily,
-- so a Local Services campaign that lives in a client's Search account
-- (Horizon HVAC's) was being synced all along, counted as Google Search. What
-- it did not have: the leads themselves, a place for a Local Services account
-- that is separate from the Search account, and a page that says who is
-- connected.
--
-- clients.lsa_customer_id
--   The Local Services account's own Google customer id, when it is a
--   separate account from google_ads_customer_id. Found by the nightly
--   discovery (a sure name match among the accounts the login can see that
--   carries a Local Services campaign) or typed. Null when the client's LSA
--   lives in their Search account, or when none is connected yet.
-- clients.lsa_synced_at / lsa_sync_error
--   How the last Local Services read went (the leads query), stamped only on
--   clients whose accounts showed a Local Services campaign.
alter table public.clients add column if not exists lsa_customer_id text;
alter table public.clients add column if not exists lsa_synced_at timestamptz;
alter table public.clients add column if not exists lsa_sync_error text;

-- Which campaign rows are Local Services: the standalone LOCAL_SERVICES type,
-- and the pay-per-lead Performance Max shape Google is moving LSA into
-- (Horizon HVAC's "Pay-per-lead-PMax-..." from 2026-11-03). The same test as
-- isLsaCampaign() in the sync and in src/lib/lsaReport.js.
create or replace function public.is_lsa_campaign(campaign_type text, campaign_name text) returns boolean
language sql immutable as $$
  select upper(coalesce(campaign_type, '')) = 'LOCAL_SERVICES'
      or (upper(coalesce(campaign_type, '')) = 'PERFORMANCE_MAX' and coalesce(campaign_name, '') ~* '(pay.?per.?lead|local services|\mlsa\M)')
$$;

-- lsa_leads
--   One row per Local Services lead (a call, a message or a booking) from
--   the Google Ads API's local_services_lead resource, written by the sync
--   for every account that shows a Local Services campaign. Whether Google
--   charged for it and whether it was credited back are what the KPIs need
--   (charged leads, cost per charged lead); the lead's status says whether
--   it was booked or declined. No contact details are kept: the caller's
--   name and number stay in Google.
create table if not exists public.lsa_leads (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  customer_id text,
  lead_id text not null,
  lead_type text,
  category_id text,
  service_id text,
  lead_status text,
  lead_charged boolean not null default false,
  credit_state text,
  credit_updated_at timestamptz,
  created_at_google timestamptz not null,
  created_date date not null,
  locale text,
  synced_at timestamptz not null default now(),
  unique (client_id, lead_id)
);
create index if not exists lsa_leads_client_date_idx on public.lsa_leads (client_id, created_date desc);
create index if not exists lsa_leads_date_idx on public.lsa_leads (created_date desc);
alter table public.lsa_leads enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'lsa_leads' and policyname = 'lsa_leads_read') then
    create policy lsa_leads_read on public.lsa_leads for select to authenticated using (true);
  end if;
end $$;
grant select on public.lsa_leads to authenticated;
