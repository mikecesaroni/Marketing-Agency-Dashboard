-- Replaces the onboarding/active/paused/churned status with what actually
-- matters day to day: is each channel live yet.
--
-- Run this whole file in the Supabase SQL Editor. Safe to run twice.

-- meta_ads_active and lsa_active already exist on clients from the original
-- schema and were never used — they are exactly these two flags, so no new
-- columns are needed for them.
alter table clients add column if not exists meta_ads_active boolean not null default false;
alter table clients add column if not exists lsa_active boolean not null default false;

-- Replaces 'churned'. Archived clients drop out of MRR, the Meta sync, the LSA
-- list and the dashboard, without any status wording in the app.
alter table clients add column if not exists archived boolean not null default false;

-- Carry over what the old status column already told us.
update clients set archived = true where status = 'churned' and archived = false;

-- Seed LSA live from whatever the intake form recorded, so nothing has to be
-- re-entered by hand.
update clients c set lsa_active = true
from onboarding_intake i
where i.client_id = c.id and i.lsa_status = 'Active' and c.lsa_active = false;

-- Anyone with a Meta ad account connected and spend on record is already live.
update clients c set meta_ads_active = true
where c.meta_ads_active = false
  and c.meta_ad_account_id is not null
  and exists (
    select 1 from weekly_kpis k
    where k.client_id = c.id and k.channel = 'Meta' and k.ad_spend > 0
  );

-- The status column is left in place rather than dropped — nothing reads it
-- any more, and keeping it means this migration is reversible. Drop it later
-- once you're happy:
--   alter table clients drop column status;

select name,
       meta_ads_active as meta_live,
       lsa_active as lsa_live,
       archived,
       status as old_status
from clients order by name;
