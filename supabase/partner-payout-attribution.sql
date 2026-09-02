-- Which payments a transfer to a partner actually covered.
--
-- Run this whole file once in the Supabase SQL Editor. Safe to run twice.
--
-- WHY, GIVEN THE BALANCE ALREADY WORKS
--
-- The lifetime balance answers "what is owed": everything earned, minus
-- everything sent. It cannot answer "which of these 24 payments have been
-- split with Ethan", and that is the question you actually have while looking
-- at a list of 24 payments. Both are needed and they are not the same.
--
-- So a payment carries the payout that covered it. That is ATTRIBUTION, not a
-- second set of books: the money still comes from earned minus sent. Nothing
-- here can change what is owed.
--
-- A FOREIGN KEY, NOT A BOOLEAN, and the reason is the undo. ON DELETE SET NULL
-- means deleting a payout un-settles everything it covered, in one act, with
-- no flags left behind saying a transfer happened that did not. A boolean
-- would need a second column for the date and a trigger to keep them honest.
--
-- WHAT DECIDES THE AMOUNT
--
-- src/lib/partnerSplit.js runs the SAME ledger function over just the ticked
-- payments -- there is deliberately no second formula for "what to send". Tick
-- everything unsettled and the amount comes out equal to what the balance says
-- is owed, because it is the same arithmetic over the same rows.

alter table payments
  add column if not exists partner_payout_id uuid
    references partner_payouts(id) on delete set null;

alter table expenses
  add column if not exists partner_payout_id uuid
    references partner_payouts(id) on delete set null;

create index if not exists payments_partner_payout_idx
  on payments (partner_payout_id) where partner_payout_id is not null;

create index if not exists expenses_partner_payout_idx
  on expenses (partner_payout_id) where partner_payout_id is not null;

-- BACKFILL FROM THE OLD PER-PAYMENT SPLIT ----------------------------------
-- The columns the old model wrote are still on the payments table, kept as the
-- audit trail for the $5,247 migration. They record exactly which six payments
-- were paid out and when, so the settled state is recoverable rather than
-- something to reconstruct by hand or start over from empty.
--
-- Matched to a payout by the month the cash landed in, which is precisely how
-- those two payout rows were created: $1,749 of July cash and $3,498 of
-- August's. Verified after running: each payout's amount is exactly half the
-- payments now attributed to it, no adjustments.
update payments p
   set partner_payout_id = o.id
  from partner_payouts o
 where p.ethan_paid_out is true
   and p.paid_date is not null
   and o.period is not null
   and date_trunc('month', p.paid_date) = date_trunc('month', o.period)
   and p.partner_payout_id is null;

-- RECORDING ONE, ATOMICALLY -------------------------------------------------
-- Three writes -- insert the payout, stamp the payments, stamp the expenses --
-- and any two of them landing without the third is a wrong balance. The
-- browser cannot open a transaction, so this is one function and one round
-- trip: it either all happens or none of it does.
create or replace function record_partner_payout(
  p_partner text,
  p_amount numeric,
  p_paid_on date,
  p_method text default null,
  p_notes text default null,
  p_payment_ids uuid[] default '{}',
  p_expense_ids uuid[] default '{}'
) returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into partner_payouts (partner, amount, paid_on, method, notes)
  values (p_partner, p_amount, coalesce(p_paid_on, current_date),
          nullif(btrim(coalesce(p_method, '')), ''),
          nullif(btrim(coalesce(p_notes, '')), ''))
  returning id into v_id;

  -- Only rows not already settled. Re-stamping a payment that another payout
  -- covered would move it silently and leave that payout describing money it
  -- no longer accounts for; undoing a settlement is deleting its payout.
  update payments
     set partner_payout_id = v_id
   where id = any(p_payment_ids)
     and partner_payout_id is null;

  update expenses
     set partner_payout_id = v_id
   where id = any(p_expense_ids)
     and partner_payout_id is null;

  return v_id;
end;
$$;
