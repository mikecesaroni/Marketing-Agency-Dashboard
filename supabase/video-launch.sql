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
