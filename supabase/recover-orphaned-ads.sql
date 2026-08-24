-- ---------------------------------------------------------------------------
-- RECOVER ORPHANED AD IMAGES
--
-- The Ad Studio uploaded artboards to storage and then failed to write the
-- matching client_files row, because file_size is NOT NULL and the insert never
-- set it. supabase-js returns errors rather than throwing, and the return value
-- was not checked, so the failure was invisible and the panel still reported
-- success.
--
-- The images are all still in the bucket. This rebuilds the missing rows from
-- storage.objects so they appear in the Studio's Saved ads tab and in the
-- client's Files.
--
-- Safe to run more than once: the NOT EXISTS check skips anything already
-- linked. Run the SELECT first to see what it will do.
-- ---------------------------------------------------------------------------

-- 1. Look before writing.
select
  o.name as storage_path,
  split_part(o.name, '/', 2)::uuid as client_id,
  (o.metadata ->> 'size')::integer as file_size,
  o.created_at
from storage.objects o
where o.bucket_id = 'client-files'
  and o.name like 'ads/%'
  and not exists (select 1 from client_files f where f.storage_path = o.name)
order by o.created_at desc;

-- 2. Rebuild the rows.
insert into client_files (client_id, file_name, file_type, file_size, storage_path, date_uploaded)
select
  split_part(o.name, '/', 2)::uuid,
  -- Matches what the Studio would have written: ad-<stamp>-<size>.png
  'ad-' || split_part(o.name, '/', 3),
  coalesce(o.metadata ->> 'mimetype', 'image/png'),
  coalesce((o.metadata ->> 'size')::integer, 0),
  o.name,
  o.created_at
from storage.objects o
where o.bucket_id = 'client-files'
  and o.name like 'ads/%'
  and split_part(o.name, '/', 2) ~ '^[0-9a-f-]{36}$'
  and exists (select 1 from clients c where c.id = split_part(o.name, '/', 2)::uuid)
  and not exists (select 1 from client_files f where f.storage_path = o.name);

-- 3. Same problem for logos and backgrounds uploaded through the Studio, which
--    land directly under <client id>/ rather than ads/.
insert into client_files (client_id, file_name, file_type, file_size, storage_path, date_uploaded)
select
  split_part(o.name, '/', 1)::uuid,
  regexp_replace(split_part(o.name, '/', 2), '^\d+-', ''),
  coalesce(o.metadata ->> 'mimetype', 'image/png'),
  coalesce((o.metadata ->> 'size')::integer, 0),
  o.name,
  o.created_at
from storage.objects o
where o.bucket_id = 'client-files'
  and o.name not like 'ads/%'
  and split_part(o.name, '/', 1) ~ '^[0-9a-f-]{36}$'
  and exists (select 1 from clients c where c.id = split_part(o.name, '/', 1)::uuid)
  and not exists (select 1 from client_files f where f.storage_path = o.name);
