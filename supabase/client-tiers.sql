-- Which of the three packages a client is on.
--
--   1  CRM / Marketing Maintenance   $1,500 a month   Meta ads, creative from
--      their job photos, leads followed up in GoHighLevel, monthly cost-per-lead
--      reporting.
--   2  The Whole Chain Marketing     $2,500 a month   Everything in 1, plus
--      Google: Search ads, Local Services Ads and the Business Profile, and
--      re-engaging their past customer list.
--   3  Runs Without You Marketing    $3,500 a month   Everything in 2, plus a
--      second-brain AI built on the business and custom automations. $500 setup.
--
-- Every package includes the GoHighLevel build, so a client with a tier is
-- on the GHL plan by definition (src/lib/nextSteps.js reads it that way).
--
-- The tier is the commercial fact, set by hand on the Client status page or
-- guessed from monthly_fee until it is (src/lib/clientTiers.js). Null means
-- nobody has said yet.
alter table public.clients
  add column if not exists tier smallint;

alter table public.clients
  drop constraint if exists clients_tier_known;
alter table public.clients
  add constraint clients_tier_known
  check (tier is null or tier in (1, 2, 3));

comment on column public.clients.tier is
  'The package: 1 Maintenance (Meta), 2 Whole Chain (Meta and Google), 3 Runs Without You (plus AI). Null until set.';

-- Everyone has GoHighLevel set up with us now, so every active client is on
-- the plan. (ghl_active stays as it is: that is the delivery fact.)
update public.clients set ghl_plan = true where archived = false and ghl_plan = false;
