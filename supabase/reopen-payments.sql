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
-- anon key. Run it in the Supabase SQL editor.
--
-- To lock the money back down later: drop these six policies and set
-- LOGIN_REQUIRED to true in src/lib/access.js, which brings back the admin
-- and VA roles properly rather than half-way.

create policy anon_open_while_login_off on public.payments
  for all to anon using (true) with check (true);

create policy anon_open_while_login_off on public.expenses
  for all to anon using (true) with check (true);

create policy anon_open_while_login_off on public.partner_payouts
  for all to anon using (true) with check (true);

create policy anon_open_while_login_off on public.stripe_events
  for all to anon using (true) with check (true);

create policy anon_open_while_login_off on public.stripe_unmatched
  for all to anon using (true) with check (true);

create policy anon_open_while_login_off on public.stripe_ignored_customers
  for all to anon using (true) with check (true);

-- The dashboard reads the payments table directly again, so the status-only
-- view built for the locked-down period has no caller left.
drop view if exists public.client_payment_state;

-- Confirm: six rows, one per table.
select tablename, policyname from pg_policies
where schemaname = 'public' and policyname = 'anon_open_while_login_off'
order by tablename;
