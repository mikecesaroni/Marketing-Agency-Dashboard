-- SIGN-IN ON: the database half of LOGIN_REQUIRED = true (src/lib/access.js).
--
-- With sign-in on, the browser talks to the database as a signed-in person
-- (the `authenticated` role, with their role in public.profiles) and the
-- anon key, which ships in the built JavaScript, must buy nothing on the
-- tables. The client pages are not affected: a dashboard, a weekly report,
-- an ad approval, an onboarding form, video scripts and videos all read
-- through SECURITY DEFINER functions (client_dashboard_load,
-- client_videos_load, weekly_report_load, ad_approval_load,
-- onboarding_link_*, client_link_name) or through Edge Functions with the
-- service key, never the tables, and the client-files bucket stays public
-- to read by URL. Everything in here is safe to run again.
--
-- HOW TO RUN IT: the Supabase SQL editor, the whole file, once, right after
-- the build with LOGIN_REQUIRED = true is live. To go back: logins-off.sql
-- and LOGIN_REQUIRED = false. See docs/logins.md.

-- 1. Close every table to the anon key: drop every policy written for anon
--    alone (anon_open_while_login_off on every table, and the few named
--    ones). The admin and VA policies for signed-in people stay underneath.
do $$
declare r record;
begin
  for r in
    select tablename, policyname from pg_policies
    where schemaname = 'public' and roles = '{anon}'::name[]
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- 2. Row-level security on every table, and a policy for signed-in people
--    on any table that has none (tables made after auth_roles_and_rls: the
--    Google Ads tables, landing pages, weekly reports, video scripts, ad
--    batches). Money tables admit only an admin; the rest admit the staff.
do $$
declare
  t text;
  money constant text[] := array[
    'payments', 'expenses', 'partner_payouts',
    'stripe_events', 'stripe_ignored_customers', 'stripe_unmatched',
    'payments_backup_20260823'
  ];
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public' and tablename <> 'profiles'
  loop
    execute format('alter table public.%I enable row level security', t);
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t and 'authenticated' = any(roles)
    ) then
      if t = any(money) then
        execute format(
          'create policy admin_all on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
          t
        );
      else
        execute format(
          'create policy staff_all on public.%I for all to authenticated using (true) with check (true)',
          t
        );
      end if;
    end if;
  end loop;
end $$;

-- 3. The client-files bucket: public to read by URL (that is how every ad
--    picture, logo and clip reaches a client page), but listing, uploading,
--    changing and deleting need a sign-in. Edge Functions use the service
--    key and are not affected.
drop policy if exists "client files read" on storage.objects;
create policy "client files read" on storage.objects
  for select to authenticated using (bucket_id = 'client-files');
drop policy if exists "client files upload" on storage.objects;
create policy "client files upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'client-files');
drop policy if exists "client files update" on storage.objects;
create policy "client files update" on storage.objects
  for update to authenticated using (bucket_id = 'client-files') with check (bucket_id = 'client-files');
drop policy if exists "client files delete" on storage.objects;
create policy "client files delete" on storage.objects
  for delete to authenticated using (bucket_id = 'client-files');

-- 4. The first admin. While profiles is empty there is nobody to make one,
--    so every login that already exists becomes an admin (there is one, the
--    owner's). From then on the Team page makes logins and nothing here
--    runs again.
insert into public.profiles (user_id, email, name, role)
select u.id, u.email, coalesce(u.raw_user_meta_data->>'name', initcap(split_part(u.email, '@', 1))), 'admin'
from auth.users u
where u.email is not null and not exists (select 1 from public.profiles)
on conflict (user_id) do nothing;

-- 5. Confirm. Expect: no anon policies, every table with RLS on, and at
--    least one admin.
select
  (select count(*) from pg_policies where schemaname = 'public' and 'anon' = any(roles)) as anon_policies,
  (select count(*) from pg_tables where schemaname = 'public' and not rowsecurity) as tables_without_rls,
  (select count(*) from public.profiles where role = 'admin') as admins;
