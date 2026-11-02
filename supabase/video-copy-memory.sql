-- The publish page keeps what the AI wrote for a video.
--
-- 2026-11-02: "if I click publish videos and the AI takes the time to
-- transcribe videos and make ad copies, make it so it saves that; if I click
-- away and come back to publish it doesn't have to do all that over again and
-- spend money." The transcript was already kept on the video
-- (ad_videos.transcript); the three versions the copy assistant wrote and
-- the copy picked or typed lived only in the page and were lost on the way
-- out, so the next visit paid for them again.
--
--   copy         { primary_text, headline, description, ad_name } as last
--                picked or typed on the publish page
--   versions     { note, variations: [{ angle, primaryText, headline, description }] }
--                the three versions written for this clip
--   versions_at  when they were written
--
-- Applied 2026-11-02 with the Supabase MCP (apply_migration).

alter table public.ad_videos
  add column if not exists copy jsonb,
  add column if not exists versions jsonb,
  add column if not exists versions_at timestamptz;
