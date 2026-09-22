-- PAYMENTS IS OPEN AGAIN.
--
-- For a few days in September 2026 the money tables admitted only an admin
-- session, so Payments needed an owner sign-in. That sign-in is gone: with
-- LOGIN_REQUIRED false there is no session to check, so the gate only ever
-- produced a login form nobody could get past. The app now shows Payments to
-- anyone who has the link, the same bargain the rest of the CRM makes.
--
-- This restores the matching database side. Without it the page renders and
-- every table on it is EMPTY, because row-level security still refuses the
-- anon key. That is what "payments are showing up as 0" means.
--
-- HOW TO RUN IT: open the Supabase SQL editor, paste the whole file, hit run.
-- It is safe to run more than once. Each policy is dropped before it is
-- created, because create policy has no IF NOT EXISTS and the editor runs the
-- file as one transaction -- so on a second run the very first duplicate would
-- abort every statement after it, leaving the job half done and looking done.
--
-- To lock the money back down later: drop these six policies and set
-- LOGIN_REQUIRED to true in src/lib/access.js, which brings back the admin
-- and VA roles properly rather than half-way.

drop policy if exists anon_open_while_login_off on public.payments;
create policy anon_open_while_login_off on public.payments
  for all to anon using (true) with check (true);

drop policy if exists anon_open_while_login_off on public.expenses;
create policy anon_open_while_login_off on public.expenses
  for all to anon using (true) with check (true);

drop policy if exists anon_open_while_login_off on public.partner_payouts;
create policy anon_open_while_login_off on public.partner_payouts
  for all to anon using (true) with check (true);

drop policy if exists anon_open_while_login_off on public.stripe_events;
create policy anon_open_while_login_off on public.stripe_events
  for all to anon using (true) with check (true);

drop policy if exists anon_open_while_login_off on public.stripe_unmatched;
create policy anon_open_while_login_off on public.stripe_unmatched
  for all to anon using (true) with check (true);

drop policy if exists anon_open_while_login_off on public.stripe_ignored_customers;
create policy anon_open_while_login_off on public.stripe_ignored_customers
  for all to anon using (true) with check (true);

-- RLS has to be on for a policy to be consulted, and a policy on a table with
-- RLS off is silently ignored. These are all already enabled; this is here so
-- the file tells the whole truth rather than half of it.
alter table public.payments enable row level security;
alter table public.expenses enable row level security;
alter table public.partner_payouts enable row level security;
alter table public.stripe_events enable row level security;
alter table public.stripe_unmatched enable row level security;
alter table public.stripe_ignored_customers enable row level security;

-- The dashboard reads the payments table directly again, so the status-only
-- view built for the locked-down period has no caller left.
drop view if exists public.client_payment_state;

-- Confirm: six rows, one per table. Fewer than six means a statement above did
-- not run, and the Payments page will still show zero for the tables missing.
select tablename, policyname from pg_policies
where schemaname = 'public' and policyname = 'anon_open_while_login_off'
order by tablename;
