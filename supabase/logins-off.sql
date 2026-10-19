-- SIGN-IN OFF: the database half of LOGIN_REQUIRED = false (src/lib/access.js).
--
-- The reverse of logins-on.sql: the browser talks to the database as anon
-- again, so every table (except profiles) admits anon, and the client-files
-- bucket admits anon for listing, uploading, changing and deleting as it
-- did before. The admin and VA policies for signed-in people stay in place
-- underneath, and profiles keeps its rows, so switching back on later is
-- logins-on.sql again. Safe to run more than once.
--
-- HOW TO RUN IT: the Supabase SQL editor, the whole file, once, together
-- with a build that has LOGIN_REQUIRED = false. Without this, that build
-- shows every table empty. See docs/logins.md.

do $$
declare t text;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public' and tablename <> 'profiles'
  loop
    execute format('drop policy if exists anon_open_while_login_off on public.%I', t);
    execute format(
      'create policy anon_open_while_login_off on public.%I for all to anon using (true) with check (true)',
      t
    );
  end loop;
end $$;

drop policy if exists "client files read" on storage.objects;
create policy "client files read" on storage.objects
  for select to anon, authenticated using (bucket_id = 'client-files');
drop policy if exists "client files upload" on storage.objects;
create policy "client files upload" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'client-files');
drop policy if exists "client files update" on storage.objects;
create policy "client files update" on storage.objects
  for update to anon, authenticated using (bucket_id = 'client-files') with check (bucket_id = 'client-files');
drop policy if exists "client files delete" on storage.objects;
create policy "client files delete" on storage.objects
  for delete to anon, authenticated using (bucket_id = 'client-files');

select
  (select count(*) from pg_policies where schemaname = 'public' and policyname = 'anon_open_while_login_off') as anon_policies,
  (select count(*) from pg_tables where schemaname = 'public' and tablename <> 'profiles') as tables;
