-- ---------------------------------------------------------------------------
-- "A CLIENT FILLED SOMETHING IN" ON THE DASHBOARD
--
-- Run supabase/ghl-setup.sql first; this adds to onboarding_links.
--
-- The submission times were already recorded there. What was missing was any
-- notion of having noticed them, so a submission either showed forever or not
-- at all. These two columns are that: null means unread.
--
-- Per form rather than one flag for the row, because the two forms get sent and
-- come back at different times, and dismissing one must not silently hide the
-- other.
-- ---------------------------------------------------------------------------
alter table onboarding_links add column if not exists intake_seen_at timestamptz;
alter table onboarding_links add column if not exists ghl_seen_at timestamptz;

-- Anything already submitted before this existed is history, not news. Without
-- this backfill, every past submission arrives as an unread notification the
-- moment the feature ships. Safe to re-run: it only touches rows still null.
update onboarding_links set intake_seen_at = intake_submitted_at
  where intake_submitted_at is not null and intake_seen_at is null;
update onboarding_links set ghl_seen_at = ghl_submitted_at
  where ghl_submitted_at is not null and ghl_seen_at is null;

-- Partial index: the dashboard only ever asks for the unread ones, and on a
-- table where almost everything is read that is a much smaller thing to scan.
create index if not exists onboarding_links_unread_idx
  on onboarding_links (client_id)
  where (intake_submitted_at is not null and intake_seen_at is null)
     or (ghl_submitted_at is not null and ghl_seen_at is null);

-- The dashboard reads these with the anon key through the policy already on
-- onboarding_links, and marks one seen with a PATCH setting the matching
-- column. No new grants are needed.
