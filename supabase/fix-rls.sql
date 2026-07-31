-- Fix: "new row violates row-level security policy for table payments"
--
-- Payments used to be inserted by the create_payment_schedule() trigger, which
-- was declared `security definer` and so ran as its owner and bypassed RLS.
-- Now that Billing Setup inserts payments from the app using the anon key, the
-- RLS policy on the table applies for the first time — and that policy only
-- grants access to the `authenticated` role, which this app never uses because
-- it runs without login.
--
-- The rest of the tables already have RLS off for the same reason, so this
-- brings payments in line with them.
--
-- Check which tables still have it on:
--   select tablename, rowsecurity from pg_tables
--   where schemaname = 'public' order by tablename;

alter table payments disable row level security;

-- The others, in case any are still enabled — a table only fails at the moment
-- the app first tries to write to it, so it is worth doing all of them now
-- rather than hitting this same error one table at a time.
alter table clients            disable row level security;
alter table onboarding_tasks   disable row level security;
alter table weekly_kpis        disable row level security;
alter table weekly_work_log    disable row level security;
alter table creative_log       disable row level security;
alter table client_files       disable row level security;
alter table deliverables       disable row level security;

-- NOTE: with RLS off, anyone who has the anon key (it ships in the built
-- JavaScript, so treat it as public) can read and write these tables. That was
-- already true for client data; it now also covers billing records. Turning
-- login back on is the fix if that matters — ask and I'll wire it up.
