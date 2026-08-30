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
