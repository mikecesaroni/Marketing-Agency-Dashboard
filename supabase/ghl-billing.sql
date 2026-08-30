-- Bills the $399/mo GoHighLevel subscription as its own kind of payment.
--
-- The reason it is a third payment_type rather than another 'monthly' row:
-- the Stripe webhook's recordPayment settles the OLDEST OUTSTANDING ROW OF
-- THE TYPE IT IS GIVEN and ignores the amount. A client on both the marketing
-- retainer and the GHL plan gets two invoices every month, so if both were
-- booked as 'monthly' the $399 would mark the $998 retainer paid. The books
-- would then run a month ahead and $599 short, every month, and the error
-- would only surface when a client was chased for money they had already sent.
--
-- With a separate type each invoice settles its own schedule, and the webhook
-- decides which one an invoice belongs to by its Stripe price id (stored in
-- app_settings as stripe_ghl_price_id), falling back to the amount.

alter table payments drop constraint if exists payments_payment_type_check;
alter table payments add constraint payments_payment_type_check
  check (payment_type = any (array['setup'::text, 'monthly'::text, 'ghl'::text]));

-- Per-client so a grandfathered or discounted rate is possible, defaulted to
-- the list price so nothing has to be typed for the normal case. Only clients
-- with ghl_plan = true are ever given a GHL schedule.
alter table clients add column if not exists ghl_monthly_fee numeric default 399;

-- ---------------------------------------------------------------------------
-- How a GHL client pays for it. Only meaningful when ghl_plan is true.
--
--   separate  two Stripe subscriptions, two invoices a month, two schedules
--             here ($998 retainer + $399 GHL).
--   bundled   one $1,500 subscription that already includes GHL. One invoice,
--             one schedule, and ghl_monthly_fee is a share of it rather than
--             an amount anyone is billed.
--
-- This has to be recorded rather than inferred, because getting it wrong
-- breaks the books in a way that stays invisible for a month. A bundled client
-- given a separate $399 schedule would have their single $1,500 invoice settle
-- one schedule and leave the other permanently unpaid; a separate client
-- treated as bundled would show $399/mo of revenue that was never invoiced.
alter table clients add column if not exists ghl_billing text not null default 'bundled';

alter table clients drop constraint if exists clients_ghl_billing_check;
alter table clients add constraint clients_ghl_billing_check
  check (ghl_billing = any (array['separate'::text, 'bundled'::text]));

-- The clients already on the plan are all billed $998 + $399 today, which is
-- the separate arrangement. New clients take the column default instead, since
-- the combined $1,500 is the going-forward standard.
update clients set ghl_billing = 'separate' where ghl_plan;
