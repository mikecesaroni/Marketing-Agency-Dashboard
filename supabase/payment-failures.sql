-- Failed card payments, tracked as facts rather than as a sentence in a note.
--
-- Run this whole file once in the Supabase SQL Editor. Safe to run twice.
--
-- WHY THIS EXISTS
--
-- MBD Pressure Washing's August invoice failed on the 30th and Stripe retried
-- it successfully on the 31st. The money is real and the row is correctly
-- marked paid. But the failure had been recorded by appending
-- "Stripe payment failed 2026-08-30" to the notes column, and a note has no
-- way of being resolved -- so the row read as a failed payment that somebody
-- had wrongly ticked off as paid. It cost a real "how did this happen".
--
-- A note also cannot be counted, filtered, or alerted on. So the failure gets
-- columns:
--
--   last_failed_at    when Stripe last told us an attempt failed
--   failure_count     how many attempts have failed (Stripe's attempt_count)
--   next_attempt_at   when Stripe will try again, which it tells us and which
--                     is the single most useful thing to know -- most failures
--                     need no action beyond waiting for the retry
--   stripe_hosted_invoice_url  the invoice, because the only real action on a
--                     failure is to go and look at it in Stripe
--
-- A failure is UNRESOLVED when last_failed_at is set and the row is not paid.
-- That is the whole rule: nothing has to be dismissed, and a retry that
-- succeeds resolves it by definition. See src/lib/paymentFailures.js.

alter table payments
  add column if not exists last_failed_at timestamptz,
  add column if not exists failure_count integer not null default 0,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists stripe_hosted_invoice_url text;

create index if not exists payments_last_failed_at_idx
  on payments (last_failed_at)
  where last_failed_at is not null;

-- BACKFILL FROM THE EVENT LOG -----------------------------------------------
-- Every failure ever received is already sitting in stripe_events with its
-- full payload, so the history is recoverable rather than something to type in
-- by hand. Matched on the invoice id: the payment row carries the invoice that
-- failed, whether or not the retry has landed yet.
--
-- Takes the LATEST failure event per invoice, since a card can fail several
-- times before Stripe gives up.
with failures as (
  select
    e.payload->'data'->'object'->>'id' as invoice_id,
    to_timestamp((e.payload->'data'->'object'->>'created')::bigint) as failed_at,
    coalesce((e.payload->'data'->'object'->>'attempt_count')::int, 1) as attempts,
    case
      when e.payload->'data'->'object'->>'next_payment_attempt' is not null
      then to_timestamp((e.payload->'data'->'object'->>'next_payment_attempt')::bigint)
    end as next_attempt,
    e.payload->'data'->'object'->>'hosted_invoice_url' as url,
    row_number() over (
      partition by e.payload->'data'->'object'->>'id'
      order by (e.payload->'data'->'object'->>'created')::bigint desc
    ) as rn
  from stripe_events e
  where e.type = 'invoice.payment_failed'
    and e.payload->'data'->'object'->>'id' is not null
)
update payments p
   set last_failed_at = f.failed_at,
       failure_count = greatest(p.failure_count, f.attempts),
       next_attempt_at = f.next_attempt,
       stripe_hosted_invoice_url = coalesce(p.stripe_hosted_invoice_url, f.url)
  from failures f
 where f.rn = 1
   and p.stripe_invoice_id = f.invoice_id
   and p.last_failed_at is distinct from f.failed_at;

-- Now that the failure is a column, take the sentence back out of the notes so
-- the row stops describing itself as failed after the retry went through.
-- Narrow on purpose: only the exact text the webhook used to write, only where
-- the structured column now carries it.
update payments
   set notes = nullif(btrim(regexp_replace(
         regexp_replace(notes, 'Stripe payment failed \d{4}-\d{2}-\d{2}', '', 'g'),
         '\s*\|\s*\|\s*', ' | ', 'g'
       ), ' |'), '')
 where notes ~ 'Stripe payment failed \d{4}-\d{2}-\d{2}'
   and last_failed_at is not null;

-- A retry that succeeded has no next attempt. Stripe's own schedule is only
-- meaningful while the money is still outstanding.
update payments
   set next_attempt_at = null
 where status = 'paid'
   and next_attempt_at is not null;
