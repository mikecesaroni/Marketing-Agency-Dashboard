-- Meta's multiple text options on an ad the CRM publishes.
--
-- 2026-11-10: Don Air's hand-built ads carry three primary texts, three
-- headlines and three descriptions, and Meta shows each viewer one of each
-- in whatever combination it expects to work ("look at Don Air copy with the
-- emojis and how it has 3 variants for each part of ad copy. I wanna have
-- those variants"). The CRM wrote one of each. Now a copy record keeps the
-- first of each where it always did (primary_text, headline, description)
-- and up to four more of each beside them:
--
--   saved_ads.more_copy   { primary_texts: [...], headlines: [...], descriptions: [...] }
--                         the extra options for a static, as typed or written
--                         on the publish page (the first of each stays in
--                         the three columns)
--
-- A video's extras ride inside ad_videos.copy (jsonb already) as
-- more_primary_texts, more_headlines and more_descriptions; nothing to add.
-- The pure half is src/lib/textOptions.js; meta-publish turns the lists into
-- the creative Meta mixes from (asset_feed_spec, DEGREES_OF_FREEDOM).
--
-- Applied 2026-11-10 with the Supabase MCP (apply_migration).

alter table public.saved_ads
  add column if not exists more_copy jsonb;

comment on column public.saved_ads.more_copy is
  'Extra Meta text options for the static: { primary_texts, headlines, descriptions } beyond the first of each in primary_text, headline and description. Null when there is one of each.';
