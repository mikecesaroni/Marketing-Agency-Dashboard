-- Who paid each Stripe payment. Applied 2026-10-23.
--
-- "Make so we can see the email that paid each Stripe payment." The address
-- on the Stripe customer, kept on the payment row and shown on the Payments
-- page after the date and the method. The webhook writes it on every payment
-- it books (supabase/functions/stripe-webhook), assigning an unmatched
-- payment copies it across (src/lib/stripeLinks.js), and the CSV import takes
-- it from the export when there is a column for it (src/lib/stripeImport.js).

alter table public.payments add column if not exists payer_email text;

-- Rows from before: the event the row was booked from carries the email
-- (invoice.customer_email, or customer_details.email on a checkout session).
update public.payments p
set payer_email = lower(coalesce(
  e.payload->'data'->'object'->>'customer_email',
  e.payload->'data'->'object'->'customer_details'->>'email'))
from public.stripe_events e
where e.id = p.stripe_event_id and p.payer_email is null
  and coalesce(e.payload->'data'->'object'->>'customer_email', e.payload->'data'->'object'->'customer_details'->>'email') is not null;

-- Then anything else that knows its Stripe customer: the latest event seen
-- for that customer names the address.
with latest as (
  select distinct on (payload->'data'->'object'->>'customer')
    payload->'data'->'object'->>'customer' as customer_id,
    lower(coalesce(payload->'data'->'object'->>'customer_email', payload->'data'->'object'->'customer_details'->>'email')) as email
  from public.stripe_events
  where coalesce(payload->'data'->'object'->>'customer_email', payload->'data'->'object'->'customer_details'->>'email') is not null
  order by payload->'data'->'object'->>'customer', received_at desc)
update public.payments p set payer_email = l.email
from latest l where l.customer_id = p.stripe_customer_id and p.payer_email is null;
