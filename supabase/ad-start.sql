-- When each client's ads started: the first day OUR ads spent anything, on
-- Meta or Google, leaving out the campaigns the client ran before we took
-- the account over (legacy_ad_campaigns, src/lib/ourAds.js).
--
-- 2026-11-11: "In the morning brief when you show clients that only have
-- 1-2 leads but we just started their ads, make sure to add that it's still
-- in learning phase." The board and the brief read two weeks of ad days,
-- which cannot tell a client fourteen days in from one running a year, so
-- this one date per client comes from the whole table. clientFlags()
-- (src/lib/clientStatus.js) adds ", still in learning phase (ads started N
-- days ago)" to the low-leads flag while the start is under LEARNING_DAYS
-- (14) ago.
--
-- Aggregated here for the same reason as client_ad_delivery: PostgREST
-- cannot group, and nobody should pull every ad day for one date.
--
-- 2026-11-12: a first spend day per channel too, so the leads flags can tell
-- a client who has not gone live on Meta yet ("Meta not yet") from one who
-- ran Meta and stopped ("Meta not running"), and the plan's "left Meta"
-- reading (ads published, Meta off, Google live) is not mistaken for a
-- client who simply has not switched Meta on.
create or replace view public.client_ad_start as
select client_id,
  min(date) as first_spend_date,
  min(date) filter (where channel = 'meta') as first_meta_spend_date,
  min(date) filter (where channel = 'google') as first_google_spend_date
from (
  select d.client_id, d.date, 'meta' as channel
  from public.ad_daily d
  where d.spend > 0
    and not exists (select 1 from public.legacy_ad_campaigns l where l.client_id = d.client_id and l.channel = 'meta' and l.campaign_id::text = d.campaign_id::text)
  union all
  select g.client_id, g.date, 'google' as channel
  from public.google_campaign_daily g
  where g.cost > 0
    and not exists (select 1 from public.legacy_ad_campaigns l where l.client_id = g.client_id and l.channel = 'google' and l.campaign_id::text = g.campaign_id::text)
) s
group by client_id;

comment on view public.client_ad_start is
  'The first day each client''s ads (ours, not the campaigns they ran before us) spent anything, on Meta or Google. '
  'The morning brief reads it to say a client with few leads is still in the learning phase.';
