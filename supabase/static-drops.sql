-- Dropped statics: finished images the editor drops in for a client, which
-- publish with one click like the dropped clips do.
--
-- 2026-11-12: "Make a separate box to drop in static images that our editor
-- is making for clients. Make it so we can publish with a click like the
-- video ones in content page."
--
-- A dropped static is stored the way a Studio-saved ad is (client_files rows
-- under ads/<client>/<stamp>-<size>.<ext>, one saved_ads row per stamp), so
-- the publish page, the gallery, the approval link and meta-publish take it
-- without learning anything new. Two columns tell a drop apart:
--
-- client_files.drop_kind
--   'static' on every file the static drop zone put in (the clip drop zone
--   leaves it null: clips are told by file_type). The Content page's static
--   board reads only these, so the Studio's own saves never show as "new
--   static dropped in".
--
-- saved_ads.dropped_by
--   Who dropped it (the CRM's "You" name). A dropped set has no Studio
--   recipe to reopen, so the gallery shows "dropped in by Kyle" where the
--   Edit button would be.
alter table public.client_files add column if not exists drop_kind text;
alter table public.saved_ads add column if not exists dropped_by text;

comment on column public.client_files.drop_kind is 'static: a finished image the editor dropped on the Content page (src/lib/staticDrops.js). Null on everything else.';
comment on column public.saved_ads.dropped_by is 'Who dropped this static in finished (no Studio recipe to reopen); null on Studio-made ads.';
