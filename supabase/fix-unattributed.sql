-- ---------------------------------------------------------------------------
-- FIX "UNATTRIBUTED" IN THE AD PERFORMANCE TREE
--
-- The daily sync task never requested campaign_id/adset_id, so every row it
-- wrote has them NULL. The drill-down groups by campaign_id, so those rows
-- collect under a made-up "Unattributed" campaign, and any ad that also has
-- older rows from the Edge Function appears TWICE with its spend split between
-- the two.
--
-- An ad belongs to exactly one ad set and one campaign for its whole life, so
-- the missing values can be copied from any other row for the same ad.
--
-- Run the SELECTs first. Safe to re-run.
-- ---------------------------------------------------------------------------

-- 1. How bad is it, per client?
select c.name,
       count(*) filter (where d.campaign_id is null) as orphan_rows,
       count(distinct d.ad_id) filter (where d.campaign_id is null) as orphan_ads,
       round(sum(d.spend) filter (where d.campaign_id is null)::numeric, 2) as orphan_spend,
       min(d.date) filter (where d.campaign_id is null) as first_orphan_day,
       max(d.date) filter (where d.campaign_id is null) as last_orphan_day
from ad_daily d join clients c on c.id = d.client_id
group by c.name having count(*) filter (where d.campaign_id is null) > 0
order by orphan_spend desc nulls last;

-- 2. Which orphans can be repaired from a sibling row, and which cannot.
with known as (
  select distinct on (ad_id) ad_id, campaign_id, campaign_name, adset_id, adset_name
  from ad_daily
  where campaign_id is not null
  order by ad_id, date desc
)
select
  count(*) filter (where k.ad_id is not null) as repairable_rows,
  count(*) filter (where k.ad_id is null) as need_a_resync
from ad_daily d
left join known k on k.ad_id = d.ad_id
where d.campaign_id is null;

-- 3. Repair. Takes the most recent known attribution for each ad.
with known as (
  select distinct on (ad_id) ad_id, campaign_id, campaign_name, adset_id, adset_name
  from ad_daily
  where campaign_id is not null
  order by ad_id, date desc
)
update ad_daily d
set campaign_id   = k.campaign_id,
    campaign_name = k.campaign_name,
    adset_id      = k.adset_id,
    adset_name    = k.adset_name
from known k
where k.ad_id = d.ad_id
  and d.campaign_id is null;

-- 4. Anything still unattributed is an ad that has never been synced with its
--    campaign, so there is nothing local to copy from. The corrected daily task
--    fills these in on its next run.
select d.ad_id, d.ad_name, c.name as client, count(*) as rows, min(d.date), max(d.date)
from ad_daily d join clients c on c.id = d.client_id
where d.campaign_id is null
group by d.ad_id, d.ad_name, c.name
order by c.name, d.ad_name;
