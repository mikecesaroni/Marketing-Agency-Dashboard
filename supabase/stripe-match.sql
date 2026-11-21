-- The CRM follows Stripe: a client's monthly fee and package are whatever
-- Stripe actually charges them.
--
-- The fee on a client row is only what somebody typed when the client was
-- added. Stripe is what they pay. When the two disagreed the CRM kept showing
-- the typed figure: the wrong monthly amount on the client's Payments tab, the
-- wrong amount on every month still to come, and the wrong pay link. "If the
-- Stripe monthly is 1500 the CRM matches that and puts them on that tier."
--
-- So, every time a Stripe monthly payment is recorded for a client:
--   1. monthly_fee becomes the amount Stripe charged;
--   2. the package (tier) becomes the one that amount is the price of, when it
--      is within $100 of a package price. An amount that is no package's price
--      changes the fee and leaves the package alone;
--   3. the months still to come on their schedule take the new amount.
--
-- ONLY WHEN STRIPE IS UNAMBIGUOUS. "What Stripe charges a month" is the total
-- charged on the client's most recent billing day: one charge for most
-- clients, two or three for a client on more than one subscription billed
-- together. The match is skipped, and the client left exactly as they are,
-- when that day does not tell the whole story:
--   - two charges that day are for the same amount, which is as likely to be
--     one payment recorded twice as two payments;
--   - the Stripe month before held a different number of charges (a second
--     subscription billed on another day, or one just added or dropped);
--   - the amount is no package's price AND it is new. A package price is
--     believed the first time it is charged. Any other amount is believed on
--     a client's first ever charge, or once it has been charged two months
--     running, because a one-off (a catch-up, a part payment, an extra
--     invoice) is recorded as a monthly payment too and must not become the
--     client's fee;
--   - there are charges on other days of the same month, unless the amount
--     is a package price.
-- Those clients stay on the Payments page's Stripe check for a person to
-- settle. One thing this cannot tell apart: a one-off invoice for exactly a
-- package price. It would move the client to that package until their next
-- subscription charge moves them back.
--
-- The package prices here are the ones in src/lib/clientTiers.js (TIERS) and
-- the $100 is tierFromFee's. scripts/check-stripe-match.mjs fails if the two
-- drift apart.
--
-- A hand-typed fee is therefore temporary: the next Stripe payment puts it
-- back to what Stripe charged. Change the price in Stripe, not here.
--
-- Safe to run more than once.

create or replace function public.match_client_to_stripe(p_client uuid, p_dry_run boolean default false)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  c record;
  latest record;
  month_n integer;
  prev_n integer;
  prev_total numeric;
  skip text;
  is_package boolean;
  new_tier integer;
  rows_changed integer := 0;
begin
  select id, monthly_fee, tier, archived into c from clients where id = p_client;
  if not found or coalesce(c.archived, false) then
    return null;
  end if;

  -- The most recent day Stripe charged this client a monthly payment, and
  -- everything it charged them that day.
  select paid_date as day, sum(amount) as total, count(*) as n, count(distinct amount) as amounts
    into latest
  from payments
  where client_id = p_client and payment_type = 'monthly' and status = 'paid' and paid_date is not null
    and (stripe_invoice_id is not null or stripe_event_id is not null)
  group by 1
  order by 1 desc
  limit 1;
  if not found then
    return null;
  end if;

  -- How many Stripe charges that whole month holds, and the month before it.
  select count(*) into month_n
  from payments
  where client_id = p_client and payment_type = 'monthly' and status = 'paid' and paid_date is not null
    and (stripe_invoice_id is not null or stripe_event_id is not null)
    and date_trunc('month', paid_date) = date_trunc('month', latest.day);

  select count(*), sum(amount) into prev_n, prev_total
  from payments
  where client_id = p_client and payment_type = 'monthly' and status = 'paid' and paid_date is not null
    and (stripe_invoice_id is not null or stripe_event_id is not null)
    and date_trunc('month', paid_date) = (
      select max(date_trunc('month', paid_date))
      from payments
      where client_id = p_client and payment_type = 'monthly' and status = 'paid' and paid_date is not null
        and (stripe_invoice_id is not null or stripe_event_id is not null)
        and date_trunc('month', paid_date) < date_trunc('month', latest.day)
    );

  new_tier := case
    when abs(latest.total - 1500) <= 100 then 1
    when abs(latest.total - 2500) <= 100 then 2
    when abs(latest.total - 3500) <= 100 then 3
    else null
  end;
  is_package := new_tier is not null;

  skip := case
    when latest.total <= 0 then 'nothing charged'
    when latest.amounts <> latest.n then 'two equal charges on one day'
    when coalesce(prev_n, 0) > 0 and prev_n <> latest.n then 'the month before had a different number of charges'
    when not is_package and coalesce(prev_n, 0) > 0 and prev_total is distinct from latest.total then 'a new amount that is no package price, not yet charged twice'
    when not is_package and month_n <> latest.n then 'charges on more than one day this month'
    else null
  end;
  if skip is not null then
    return jsonb_build_object('matched', false, 'reason', skip, 'stripe', latest.total, 'fee', c.monthly_fee);
  end if;

  if not p_dry_run then
    update clients
       set monthly_fee = latest.total,
           tier = coalesce(new_tier, tier)
     where id = p_client
       and (monthly_fee is distinct from latest.total or (new_tier is not null and tier is distinct from new_tier));

    update payments
       set amount = latest.total
     where client_id = p_client and payment_type = 'monthly' and status in ('pending', 'overdue')
       and due_date > latest.day and amount is distinct from latest.total;
    get diagnostics rows_changed = row_count;
  else
    select count(*) into rows_changed
    from payments
    where client_id = p_client and payment_type = 'monthly' and status in ('pending', 'overdue')
      and due_date > latest.day and amount is distinct from latest.total;
  end if;

  return jsonb_build_object(
    'matched', true,
    'stripe', latest.total,
    'fee_was', c.monthly_fee,
    'tier_was', c.tier,
    'tier', coalesce(new_tier, c.tier),
    'months_to_come_changed', rows_changed
  );
end $$;

-- Recording a payment must never fail because the matching did. Whatever goes
-- wrong in there is swallowed: the payment is the thing that matters, and the
-- Stripe check on the Payments page still shows any fee left disagreeing.
create or replace function public.payments_match_stripe()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'paid' and new.payment_type = 'monthly' and new.client_id is not null
     and (new.stripe_invoice_id is not null or new.stripe_event_id is not null) then
    begin
      perform public.match_client_to_stripe(new.client_id);
    exception when others then
      null;
    end;
  end if;
  return null;
end $$;

create or replace trigger payments_match_stripe
  after insert or update of status, amount, paid_date, client_id on public.payments
  for each row execute function public.payments_match_stripe();
