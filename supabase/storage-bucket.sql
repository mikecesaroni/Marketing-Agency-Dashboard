-- Fix: "Bucket not found" when uploading client files.
--
-- The app stores logos and documents in a Storage bucket called 'client-files'.
-- Tables live in the database, buckets don't — creating the client_files table
-- did not create the bucket, so it has to be made once here.
--
-- Run this whole file in the Supabase SQL Editor. It is safe to run twice.

-- 1. The bucket itself. Public because the app builds download links with
--    getPublicUrl() — see the note at the bottom about what that means.
insert into storage.buckets (id, name, public)
values ('client-files', 'client-files', true)
on conflict (id) do update set public = true;

-- 2. Access policies. Storage always enforces row-level security on
--    storage.objects, even when RLS is off on your own tables, so without
--    these the upload fails even once the bucket exists.
--
--    Postgres has no "create policy if not exists", so each one is dropped
--    first to keep this file re-runnable.

drop policy if exists "client files read" on storage.objects;
create policy "client files read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'client-files');

drop policy if exists "client files upload" on storage.objects;
create policy "client files upload"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'client-files');

drop policy if exists "client files delete" on storage.objects;
create policy "client files delete"
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'client-files');

-- NOTE: a public bucket means anyone who has a file's URL can open it without
-- logging in. The URLs are long and random, so they aren't guessable, but they
-- also aren't protected — worth knowing before uploading signed contracts or
-- anything else sensitive. Private buckets with signed URLs are the
-- alternative; ask and I'll switch it over.
