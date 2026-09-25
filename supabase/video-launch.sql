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
