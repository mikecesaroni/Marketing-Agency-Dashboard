-- The video machine: what the weekly board and the clip checks need to know.
--
-- published_ads.video_id
--   The Meta video id an ad was built on, null for an image ad. Until now a
--   published ad did not say whether it was a video, so "who got a video this
--   week" could not be answered. Older video ads are recognisable anyway:
--   they are the rows with no size_key, because sizes belong to artboards
--   (src/lib/videoLaunch.js isVideoAd reads both).
--
-- ad_videos.duration_seconds / width / height
--   Measured in the browser when the clip is previewed (the <video> element
--   reports them for free) and by transcribe-video for the duration. They
--   drive the clip checks: a 16:9 clip gets bars on every phone placement, a
--   two-minute clip is not a Reel, a four-second one has no time to say
--   anything.

alter table published_ads add column if not exists video_id text;
alter table ad_videos add column if not exists duration_seconds numeric;
alter table ad_videos add column if not exists width integer;
alter table ad_videos add column if not exists height integer;

create index if not exists published_ads_client_created_idx on published_ads (client_id, created_at desc);

-- client_files.uploaded_by
--   Who dropped the clip in, from the "You:" name the CRM already keeps for
--   tasks. The board says "tuneup.mp4 dropped 2h ago by Sam" so the person
--   publishing knows who to ask what it is.
alter table client_files add column if not exists uploaded_by text;

-- app_settings.video_drops_reset_at
--   "Start fresh": clips added before this moment never show as "new clip
--   dropped in", whatever else is true of them. Written by the board's
--   "clear new-clip flags" link; set once by hand on 2026-09-25 so the
--   clips already in the CRM did not all light up on day one.
insert into app_settings (key, value, updated_at) values ('video_drops_reset_at', now()::text, now())
on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;

-- client_newest_ad
--   The newest ad Meta has for each client, from the nightly sync, so a
--   client whose ads were built straight in Ads Manager (Comfort Experts:
--   eight ads, none through the CRM) does not read "no ad yet" on the
--   board. first_seen is the first day the ad reported; is_video is whether
--   it ever reported a video play.
create or replace view client_newest_ad as
select distinct on (client_id) client_id, ad_id, ad_name, first_seen, video_plays > 0 as is_video
from (
  select client_id, ad_id, max(ad_name) as ad_name, min(date) as first_seen, coalesce(sum(video_plays), 0) as video_plays
  from ad_daily group by client_id, ad_id
) a
order by client_id, first_seen desc, ad_id desc;
grant select on client_newest_ad to anon, authenticated;

-- client_files.drop_dismissed_at / ad_videos.drop_dismissed_at
--   "Not new": a clip somebody waved off the board without publishing it
--   through the CRM (published in Ads Manager by hand, a duplicate, a test).
--   Set by the row's "not new" button; the clip stays, it just stops being
--   flagged. On both tables because an upload has a client_files row from
--   the start and an ad_videos row only once Meta has it.
alter table client_files add column if not exists drop_dismissed_at timestamptz;
alter table ad_videos add column if not exists drop_dismissed_at timestamptz;

-- clients.paused_at
--   A client on pause: still a client (lists, the Meta sync), but not
--   expected to be running ads or paying right now, so the dashboard's "ads
--   account paused" alert and the video board's "10+ days without a new ad"
--   leave them alone, they are out of MRR from this day, and the scheduled
--   monthly rows due on or after it are not owed (src/lib/billing.js). On
--   resume the client page deletes the paused months already behind us, since
--   Stripe never invoiced them. Null means active. Set and cleared from the
--   client page.
alter table clients add column if not exists paused_at timestamptz;
