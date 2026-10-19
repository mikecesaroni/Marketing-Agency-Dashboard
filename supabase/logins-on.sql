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
-- Nothing is dropped. The anon policies stay where they are and are closed
-- (using false, with check false), so logins-off.sql opens the very same
-- policies again and the two files are mirror images.
--
-- HOW TO RUN IT: the Supabase SQL editor, the whole file, once, right after
-- the build with LOGIN_REQUIRED = true is live. To go back: logins-off.sql
-- and LOGIN_REQUIRED = false. See docs/logins.md.

-- 1. Close every policy written for anon alone (anon_open_while_login_off
--    on every table, and the few named ones). The admin and VA policies
--    for signed-in people stay underneath. A policy's shape decides which
--    half it has: a delete or select policy has only `using`, an insert
--    policy only `with check`, the rest both.
do $$
declare r record;
begin
  for r in
    select tablename, policyname, cmd from pg_policies
    where schemaname = 'public' and roles = '{anon}'::name[]
  loop
    if r.cmd in ('SELECT', 'DELETE') then
      execute format('alter policy %I on public.%I using (false)', r.policyname, r.tablename);
    elsif r.cmd = 'INSERT' then
      execute format('alter policy %I on public.%I with check (false)', r.policyname, r.tablename);
    else
      execute format('alter policy %I on public.%I using (false) with check (false)', r.policyname, r.tablename);
    end if;
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
    if not (select rowsecurity from pg_tables where schemaname = 'public' and tablename = t) then
      execute format('alter table public.%I enable row level security', t);
    end if;
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
alter policy "client files read" on storage.objects to authenticated;
alter policy "client files upload" on storage.objects to authenticated;
alter policy "client files update" on storage.objects to authenticated;
alter policy "client files delete" on storage.objects to authenticated;

-- 4. The first admin. While profiles is empty there is nobody to make one,
--    so every login that already exists becomes an admin (there is one, the
--    owner's). From then on the Team page makes logins and nothing here
--    runs again.
insert into public.profiles (user_id, email, name, role)
select u.id, u.email, coalesce(u.raw_user_meta_data->>'name', initcap(split_part(u.email, '@', 1))), 'admin'
from auth.users u
where u.email is not null and not exists (select 1 from public.profiles)
on conflict (user_id) do nothing;

-- 5. Confirm. Expect: no open anon policy, every table with RLS on, the
--    bucket's four policies for authenticated only, and at least one admin.
select
  (select count(*) from pg_policies
   where schemaname = 'public' and 'anon' = any(roles)
     and not ((cmd in ('SELECT', 'DELETE') and qual = 'false') or (cmd = 'INSERT' and with_check = 'false') or (qual = 'false' and with_check = 'false'))) as anon_policies_still_open,
  (select count(*) from pg_tables where schemaname = 'public' and not rowsecurity) as tables_without_rls,
  (select count(*) from pg_policies where schemaname = 'storage' and 'anon' = any(roles)) as storage_policies_for_anon,
  (select count(*) from public.profiles where role = 'admin') as admins;
