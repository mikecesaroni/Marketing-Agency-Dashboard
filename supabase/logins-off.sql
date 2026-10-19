-- SIGN-IN OFF: the database half of LOGIN_REQUIRED = false (src/lib/access.js).
--
-- The mirror image of logins-on.sql: the browser talks to the database as
-- anon again, so every anon policy is opened (using true, with check true;
-- the policies were never dropped, only closed), and the client-files
-- bucket admits anon for listing, uploading, changing and deleting as it
-- did before. A table made since sign-in went on, with no anon policy of
-- its own, gets one. The admin and VA policies for signed-in people stay
-- in place underneath, and profiles keeps its rows, so switching back on
-- later is logins-on.sql again. Safe to run more than once.
--
-- HOW TO RUN IT: the Supabase SQL editor, the whole file, once, together
-- with a build that has LOGIN_REQUIRED = false. Without this, that build
-- shows every table empty. See docs/logins.md.

do $$
declare r record;
declare t text;
begin
  for r in
    select tablename, policyname, cmd from pg_policies
    where schemaname = 'public' and roles = '{anon}'::name[]
  loop
    if r.cmd in ('SELECT', 'DELETE') then
      execute format('alter policy %I on public.%I using (true)', r.policyname, r.tablename);
    elsif r.cmd = 'INSERT' then
      execute format('alter policy %I on public.%I with check (true)', r.policyname, r.tablename);
    else
      execute format('alter policy %I on public.%I using (true) with check (true)', r.policyname, r.tablename);
    end if;
  end loop;
  for t in
    select tablename from pg_tables
    where schemaname = 'public' and tablename <> 'profiles'
      and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = pg_tables.tablename and 'anon' = any(p.roles))
  loop
    execute format(
      'create policy anon_open_while_login_off on public.%I for all to anon using (true) with check (true)',
      t
    );
  end loop;
end $$;

alter policy "client files read" on storage.objects to anon, authenticated;
alter policy "client files upload" on storage.objects to anon, authenticated;
alter policy "client files update" on storage.objects to anon, authenticated;
alter policy "client files delete" on storage.objects to anon, authenticated;

select
  (select count(*) from pg_policies where schemaname = 'public' and 'anon' = any(roles) and qual = 'true') as anon_policies_open,
  (select count(*) from pg_tables where schemaname = 'public' and tablename <> 'profiles') as tables,
  (select count(*) from pg_policies where schemaname = 'storage' and 'anon' = any(roles)) as storage_policies_for_anon;
