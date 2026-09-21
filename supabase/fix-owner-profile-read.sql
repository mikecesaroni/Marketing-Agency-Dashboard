-- WHY THIS EXISTS.
--
-- Signing in as the owner showed "not an owner login". The session was fine
-- and the profiles row said role = admin; the app could not READ that row, so
-- the role fell back to 'viewer' and Payments and Team stayed shut.
--
-- Two causes, both here:
--
--   1. The read policy on profiles did not plainly let a person read their own
--      row, so the one query AuthContext makes after signing in came back
--      empty. An empty result is not an error, so nothing was reported.
--
--   2. is_admin() reads profiles. If it is not SECURITY DEFINER it is subject
--      to the same policy, which is circular: to read your profile you must be
--      admin, to know you are admin you must read your profile. Every money
--      table's admin_all policy calls it, so this would have emptied Payments
--      even once the login worked.
--
-- Run this in the Supabase SQL editor, then sign in again.

-- 1. Everyone reads their own profile. Nothing else is needed here: the Team
--    page lists members through the team-admin Edge Function, which uses the
--    service key and does not go through this policy.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select to authenticated
  using (user_id = auth.uid());

-- 2. is_admin() answers without tripping over that policy.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and role = 'admin'
  )
$$;

-- 3. Confirm. Expect one row, role admin, for ethan@horizonhvacinc.com.
select user_id, email, name, role from public.profiles;
