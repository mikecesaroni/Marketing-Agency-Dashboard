-- The words ahead of the click (2026-11-12): supabase/functions/copy-ahead
-- writes the three text options for every dropped static and clip not yet
-- published, every two minutes, so the publish page opens with the fields
-- full. See docs/video-copy.md, "Written ahead".
--
-- Run in the Supabase SQL editor. The cron line needs the project's anon
-- key where video-sweep.sql has it; copy the headers off the video-sweep
-- job (select command from cron.job where jobname = 'video-sweep').

-- The claims and the outcome, on the rows the words land on. A claim is
-- taken before the copy assistant is asked, so two runs at once (the
-- schedule and the nudge a drop box sends) never pay for the same words.
alter table public.saved_ads
  add column if not exists copy_requested_at timestamptz,
  add column if not exists copy_written_at timestamptz,
  add column if not exists copy_error text;

alter table public.ad_videos
  add column if not exists transcribe_requested_at timestamptz,
  add column if not exists copy_requested_at timestamptz,
  add column if not exists copy_written_at timestamptz,
  add column if not exists copy_error text;

-- Every two minutes on the odd minute; video-sweep has the even one, and
-- makes the ad_videos row a dropped clip's transcript and words land on.
-- select cron.schedule(
--   'copy-ahead',
--   '1-59/2 * * * *',
--   $$
--   select net.http_post(
--     url     := 'https://<project>.supabase.co/functions/v1/copy-ahead',
--     headers := '{"Content-Type":"application/json","Authorization":"Bearer <anon key>","apikey":"<anon key>"}'::jsonb,
--     body    := '{"action":"sweep"}'::jsonb,
--     timeout_milliseconds := 120000
--   );
--   $$
-- );
