-- The client's videos: every video ad that went live on their account, to
-- watch and download from their own link.
--
-- Two kinds of video ad, told apart by `source`:
--
--   crm     Published through the CRM (published_ads, the rows with a
--           video_id or, from before video_id existed, no size_key). The
--           clip itself is in the client-files bucket when the CRM uploaded
--           it (ad_videos, joined on the Meta video id), so the page can
--           play it and hand it over as a download under its own name. A
--           clip published from the client's Drive folder has a drive: path
--           and no bucket object; the page falls back to Meta's copy.
--   synced  Made straight in Ads Manager and known only from the nightly
--           sync (ad_daily rows that reported video plays). No file of
--           ours; the page asks the client-dashboard function for Meta's
--           own link, the way the dashboard's ad cards do.
--
-- Token-gated like client_dashboard_load: the token in the link is the
-- credential, the function runs as definer, and it returns the client's
-- name and the list, nothing else. Storage paths are public-bucket paths.
-- Newest first.

create or replace function client_videos_load(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with c as (
    select id, name
    from clients
    where dashboard_token = p_token and length(p_token) >= 20 and archived = false
    limit 1
  ),
  crm as (
    select p.ad_id, p.ad_name, p.created_at as published_at, p.video_id, p.status,
      v.storage_path, v.file_name, v.thumb_url, v.duration_seconds, v.width, v.height
    from published_ads p
    left join lateral (
      select storage_path, file_name, thumb_url, duration_seconds, width, height
      from ad_videos a
      where a.client_id = p.client_id and p.video_id is not null and a.meta_video_id = p.video_id
      order by a.created_at desc
      limit 1
    ) v on true
    where p.client_id = (select id from c) and (p.video_id is not null or p.size_key is null)
  ),
  synced as (
    select ad_id, max(ad_name) as ad_name, min(date)::timestamptz as published_at
    from ad_daily
    where client_id = (select id from c) and video_plays > 0
      and ad_id is not null and ad_id not in (select ad_id from published_ads where client_id = (select id from c) and ad_id is not null)
    group by ad_id
  ),
  rows_ as (
    select jsonb_build_object(
      'ad_id', ad_id, 'name', ad_name, 'published_at', published_at, 'source', 'crm', 'video_id', video_id, 'status', status,
      'storage_path', storage_path, 'file_name', file_name, 'thumb', thumb_url,
      'duration_seconds', duration_seconds, 'width', width, 'height', height
    ) as row, published_at
    from crm
    union all
    select jsonb_build_object('ad_id', ad_id, 'name', ad_name, 'published_at', published_at, 'source', 'synced') as row, published_at
    from synced
  )
  select case when (select id from c) is null then null else jsonb_build_object(
    'client', (select jsonb_build_object('name', name) from c),
    'generated_at', now(),
    'videos', coalesce((select jsonb_agg(row order by published_at desc nulls last) from rows_), '[]'::jsonb)
  ) end;
$$;
revoke all on function client_videos_load(text) from public;
grant execute on function client_videos_load(text) to anon, authenticated;

-- The link preview for /videos/<token> shows the business name, through
-- the same lookup the dashboard, report and scripts links use (first
-- written in client-dashboard.sql; this is the whole definition).
create or replace function client_link_name(p_kind text, p_token text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_kind in ('dashboard', 'scripts', 'videos') then (select name from clients where dashboard_token = p_token and archived = false and length(p_token) >= 20 limit 1)
    when p_kind = 'report' then (select c.name from weekly_reports w join clients c on c.id = w.client_id where w.token = p_token and length(p_token) >= 20 limit 1)
    else null
  end;
$$;
revoke all on function client_link_name(text, text) from public;
grant execute on function client_link_name(text, text) to anon, authenticated;
