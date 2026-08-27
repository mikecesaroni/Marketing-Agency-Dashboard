-- ---------------------------------------------------------------------------
-- PUBLISH TO META — database side
--
-- Run this in the Supabase SQL Editor before deploying the meta-publish Edge
-- Function. Safe to re-run.
--
-- Background: the Studio composites an ad and drops three PNGs in the public
-- bucket, but everything Meta needs beyond the picture — which Page it posts
-- as, the copy that sits above the image, where it ran — lived nowhere. This
-- adds those columns and a record of what was actually created.
-- ---------------------------------------------------------------------------

-- 1. The Facebook Page an ad posts as.
--
--    An ad creative is a Page post. Without a page_id Meta rejects the
--    creative outright, and the ad account ID is not a substitute: one ad
--    account can serve several Pages. Numeric ID only.
alter table clients add column if not exists meta_page_id text;

-- 2. The pixel used to optimise for leads.
--
--    Only needed for the "Leads (website)" objective, which asks Meta to
--    optimise towards a Lead conversion event. Traffic campaigns ignore it.
alter table clients add column if not exists meta_pixel_id text;

-- 3. The landing page ads point at.
--
--    Stored per client rather than typed per publish: it is the same URL every
--    time, and a typo here is an ad spending money into a 404.
alter table clients add column if not exists website_url text;

-- 4. The ad copy that is NOT painted on the image.
--
--    The chat has been writing primary text, headline and description all
--    along, but the Studio only ever showed them in a read-only "copy this
--    yourself" banner. Publishing has to send them, so they have to be stored.
alter table saved_ads add column if not exists primary_text text;
alter table saved_ads add column if not exists headline text;
alter table saved_ads add column if not exists description text;

-- 5. What was published, and where it landed.
--
--    Written after a successful publish so the Studio can say "already sent to
--    Meta on the 3rd" instead of quietly creating a second identical campaign
--    the next time somebody clicks the button. Also the only record tying a
--    saved ad's stamp to the Meta object IDs it became.
create table if not exists published_ads (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,

  -- The saved-ad stamp this was published from. Text, matching saved_ads.stamp.
  -- Not a foreign key: an ad can be deleted from the gallery and the thing it
  -- became still exists in the ad account.
  stamp text,
  size_key text,

  ad_account_id text not null,
  campaign_id text,
  campaign_name text,
  adset_id text,
  adset_name text,
  creative_id text,
  ad_id text,
  ad_name text,

  objective text,
  daily_budget_cents integer,
  -- The geo targeting as sent, so what a campaign was pointed at is answerable
  -- later without a round trip to Meta.
  locations jsonb,

  -- Always 'PAUSED' at creation. Kept as a column rather than assumed, because
  -- the whole safety story of this feature is that nothing goes live without a
  -- human clicking it live in Ads Manager.
  status text not null default 'PAUSED',

  published_by text,
  created_at timestamptz default now()
);

create index if not exists published_ads_client_idx on published_ads (client_id, created_at desc);
create index if not exists published_ads_stamp_idx on published_ads (client_id, stamp);

-- Same posture as the rest of this schema: the app is behind an auth wall and
-- the Edge Function writes with the service role.
alter table published_ads disable row level security;

-- ---------------------------------------------------------------------------
-- INSTANT FORMS (added after the first publish shipped)
--
-- A lead form opens inside Facebook rather than sending people to a landing
-- page, which for home services is usually the better trade: no page load to
-- lose people at, and Meta prefills name, phone and email from the profile.
-- ---------------------------------------------------------------------------

-- 6. Privacy policy URL.
--
--    Meta requires one on every instant form and rejects the form without it.
--    So instant forms do not remove the URL requirement, they change which URL
--    is needed — and this one is usually a page the client already has.
alter table clients add column if not exists privacy_policy_url text;

-- 7. Which form an ad was published against.
--
--    A form owns its leads, so knowing which form an ad points at is how you
--    know where its leads went.
alter table published_ads add column if not exists lead_form_id text;
alter table published_ads add column if not exists lead_form_name text;
