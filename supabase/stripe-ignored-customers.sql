-- Some Stripe accounts on this connection bill for more than one business.
-- When a payment from one of those other businesses can't match a client
-- here (correctly — it never will), it still lands in stripe_unmatched every
-- time it recurs. This is the allowlist-style fix: once a customer or email
-- is marked "not this business" from the Unmatched payments queue, the
-- webhook stops parking anything from them at all, on any future event.

create table if not exists stripe_ignored_customers (
  id uuid primary key default gen_random_uuid(),
  stripe_customer_id text,
  customer_email text,
  reason text,
  created_at timestamptz default now()
);

-- Either field alone is enough to recognise a repeat, and both are optional —
-- an event can carry a customer id with no email or vice versa.
create unique index if not exists stripe_ignored_customers_customer_id_key
  on stripe_ignored_customers (stripe_customer_id)
  where stripe_customer_id is not null;

create unique index if not exists stripe_ignored_customers_email_key
  on stripe_ignored_customers (lower(customer_email))
  where customer_email is not null;

alter table stripe_ignored_customers disable row level security;
