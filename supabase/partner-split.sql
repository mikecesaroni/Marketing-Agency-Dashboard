-- Expenses, and a 50/50 split taken AFTER them.
--
-- Run this whole file once in the Supabase SQL Editor. Safe to run twice.
--
-- WHAT CHANGES, AND WHY IT HAD TO
--
-- The old model split each payment on its own: a $1,749 payment meant $874.50
-- to Ethan, marked on the payment row. That works right up until there are
-- costs, because a cost does not belong to any one payment. You cannot deduct
-- an employee's wages from "the Belk October invoice" -- it comes off the pool.
--
-- So this moves off per-payment entirely and onto ONE RUNNING LIFETIME BALANCE.
-- Everything ever collected, minus everything ever spent, split by the agreed
-- percent, minus everything ever sent. What is left is what is owed.
--
-- It went through a monthly version first, and that is worth knowing because
-- the reason it did not last is the reason this shape is right. A month has to
-- be defended from change: log an expense three weeks late and it restates a
-- number two people already agreed, so every payout had to store a snapshot of
-- the arithmetic it came from and the screen had to show the drift between the
-- snapshot and the present. A running balance needs none of that -- a
-- back-dated expense just moves the balance, which is the correct answer
-- rather than a problem to detect. The snapshot columns are gone.
--
-- CASH BASIS, deliberately. Only money that actually moved counts -- payments
-- by paid_date, expenses by their own date. Not what was invoiced, not what was
-- owed. It is the way both partners already think about it, it matches the bank
-- statement, and mixing the two silently is how splits turn into arguments.
--
-- TWO THINGS MAKE THIS TRUSTWORTHY RATHER THAN JUST FUNCTIONAL
--
--   1. WHO FRONTED THE MONEY IS TRACKED. If one partner pays an employee out of
--      their own pocket, they are owed that back on TOP of their profit share,
--      and the totals still have to balance against the business account. See
--      src/lib/partnerSplit.js -- the identity is asserted in the checks.
--   2. NOTHING IS DEDUCTED SILENTLY. Every expense carries `shared`, and only
--      shared ones come off before the split. A personal cost sitting in the
--      ledger cannot quietly reduce the other partner's half.
--
-- WHAT THIS IS NOT
--
-- It is not payroll and not bookkeeping. It records what was paid so the split
-- is right. If the people being paid are employees there is withholding and
-- payroll tax to file; if they are contractors there are 1099s at year end.
-- Neither is modelled here and neither should be inferred from it. Keep the
-- real thing in real payroll software and treat this as the management view.

-- 1. EXPENSES ---------------------------------------------------------------
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),

  -- The date the money moved. Cash basis, so this is what puts an expense in
  -- one month rather than another.
  spent_on date not null default current_date,
  amount numeric not null check (amount > 0),

  -- Who was paid. Free text rather than a table of employees: the list is
  -- short, it changes, and forcing a record to be created before a cost can be
  -- logged is exactly the friction that stops costs being logged at all.
  payee text not null,

  category text not null default 'employee'
    check (category in ('employee', 'contractor', 'software', 'ads', 'fees', 'other')),

  -- Comes off the top before the split. False for anything one partner is
  -- carrying alone -- without this flag a personal cost could quietly halve
  -- the other partner's share.
  shared boolean not null default true,

  -- Which pocket it came out of. 'business' is the normal case. The other two
  -- mean a partner is owed this back on top of their profit share.
  paid_by text not null default 'business' check (paid_by in ('business', 'me', 'ethan')),

  -- Optional. Some costs belong to one client and it is worth being able to see
  -- that; most do not.
  client_id uuid references clients(id) on delete set null,

  notes text,
  created_at timestamptz not null default now()
);

create index if not exists expenses_spent_on_idx on expenses (spent_on);
create index if not exists expenses_client_idx on expenses (client_id);

alter table expenses disable row level security;

-- 2. PAYOUTS ----------------------------------------------------------------
-- One row per payment actually sent to a partner. Just the fact of the
-- transfer: who, how much, when, how. Nothing about which period it settles,
-- because there are no periods -- it comes off the running balance.
create table if not exists partner_payouts (
  id uuid primary key default gen_random_uuid(),

  -- Only the rows migrated from the old per-payment split have this, and only
  -- because the month their cash landed in was worth keeping. Nothing reads it
  -- and nothing new writes it.
  period date,

  partner text not null default 'ethan' check (partner in ('me', 'ethan')),
  amount numeric not null check (amount > 0),
  paid_on date not null default current_date,
  method text,
  notes text,

  created_at timestamptz not null default now()
);

create index if not exists partner_payouts_paid_on_idx on partner_payouts (paid_on);
drop index if exists partner_payouts_period_idx;

alter table partner_payouts disable row level security;

-- Converge a database that ran the monthly version of this file. The five
-- basis_* columns snapshotted a month's arithmetic so drift could be shown
-- against it; a running balance has nothing to defend and nothing to snapshot.
alter table partner_payouts alter column period drop not null;
alter table partner_payouts
  drop column if exists basis_collected,
  drop column if exists basis_expenses,
  drop column if exists basis_net,
  drop column if exists basis_split_percent,
  drop column if exists basis_reimbursement;

-- 3. THE LEGACY PAYOUT ------------------------------------------------------
-- Six payments were marked paid out on 2026-08-26, totalling $5,247 -- exactly
-- half of the $10,494 underneath them, no hand adjustments. That is one real
-- payment to Ethan and it has to survive the model change.
--
-- Kept as two rows split by the month the cash landed in -- $1,749 of July
-- cash and $3,498 of August -- which mattered under the monthly model and is
-- now just harmless history. What matters is the $5,247 total: without it the
-- balance would say Ethan is owed money he has already had.
--
-- Keyed on the method so re-running this file cannot double it.
insert into partner_payouts (period, partner, amount, paid_on, method, notes)
select date_trunc('month', p.paid_date)::date,
       'ethan',
       sum(p.ethan_payout_amount),
       max(p.ethan_paid_out_date),
       'migrated',
       'Carried over from the old per-payment split. ' || count(*) ||
       ' payment(s) whose cash landed in this month, settled on ' ||
       max(p.ethan_paid_out_date) || '.'
from payments p
where p.ethan_paid_out
  and p.ethan_payout_amount is not null
  and not exists (select 1 from partner_payouts existing where existing.method = 'migrated')
group by date_trunc('month', p.paid_date);

-- The old columns are deliberately LEFT IN PLACE and left populated. They are
-- the audit trail for the migration above, and dropping them would destroy the
-- only evidence of how that $5,247 was arrived at. Nothing reads them any more
-- -- src/lib/partnerSplit.js works entirely off the two tables here.

-- 4. THE SPLIT PERCENT ------------------------------------------------------
-- Already seeded by ethan-payouts.sql; repeated so this file stands alone.
insert into app_settings (key, value) values ('ethan_split_percent', '50')
on conflict (key) do nothing;
