-- The editor's note on a dropped clip. Applied 2026-10-25.
--
-- Kyle: "is it possible I can attach notes when I submit videos? For the
-- Active Air videos, I think they were meant to be posted a day apart."
-- One short line typed in the drop zone on the Content page, kept on the
-- upload row and carried everywhere the clip is mentioned: the video board,
-- the publish screen, the Slack alert, the morning brief and the Client
-- tiers flag. Written by src/lib/adVideoStore.js (uploadVideo, setDropNote),
-- read by src/lib/videoLaunch.js (waitingClips).

alter table public.client_files add column if not exists drop_note text;
