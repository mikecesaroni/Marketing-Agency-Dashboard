-- Declined cards in the unmatched queue. Applied 2026-10-29; safe to run twice.
--
-- A declined card from a customer nobody has linked yet is parked in
-- stripe_unmatched like a payment (supabase/functions/stripe-webhook). It is
-- not one: assigning it marked a month PAID with no money behind it. Classic
-- Home Services' October 2026 invoice was declined before their customer was
-- linked, the decline was assigned as a payment, the CRM read October as paid
-- for ten days while Stripe kept retrying, and the later declines landed on
-- November. ("Make so when a payment declines but then is successful, it goes
-- away in the failed payments section.")
--
-- These columns say what a parked row is. The queue shows a decline as a
-- decline, with Stripe's retry date; assigning it records the decline on the
-- client's oldest open month (status overdue, the failure columns filled, the
-- invoice stamped so the retry finds that same row) and links the customer.
-- Money arriving for the same customer and amount turns a parked decline into
-- a parked payment.

alter table stripe_unmatched add column if not exists failed boolean not null default false;
alter table stripe_unmatched add column if not exists failure_count integer;
alter table stripe_unmatched add column if not exists next_attempt_at timestamptz;
alter table stripe_unmatched add column if not exists hosted_invoice_url text;

update stripe_unmatched set failed = true
where failed = false and description ilike 'Failed payment from%';

-- The webhook, from the same day:
--   * a decline for an invoice the books already show paid is ignored (Stripe
--     delivers out of order and retries), so it never marks the next month;
--   * the money for an invoice clears that invoice's decline from any other
--     open month still carrying it (back to pending, failure columns off).
-- And the Payments page's failed-payments card drops a decline whose invoice
-- is paid on any row (src/lib/paymentFailures.js).
