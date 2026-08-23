-- Stripe -> CRM payment tracking.
--
-- A payment link is one generic URL, so Stripe has no idea which client is
-- paying. Two things bridge that gap and both are needed:
--
--   1. client_reference_id, appended to the link per client. It arrives on
--      checkout.session.completed and nowhere else.
--   2. stripe_customer_id, recorded on that first event. Every later monthly
--      invoice carries the customer id but NOT client_reference_id, so this is
--      the only thing that keeps month two onward attached to the client.

alter table clients add column if not exists stripe_customer_id text;

-- One Stripe customer belongs to one client. Partial, so the many clients
-- without a customer yet do not collide on null.
create unique index if not exists clients_stripe_customer_id_key
  on clients (stripe_customer_id)
  where stripe_customer_id is not null;

alter table payments add column if not exists stripe_event_id text;
alter table payments add column if not exists stripe_invoice_id text;
alter table payments add column if not exists stripe_customer_id text;

create unique index if not exists payments_stripe_event_id_key
  on payments (stripe_event_id)
  where stripe_event_id is not null;

-- Every event Stripe delivers, kept verbatim. This is the idempotency guard:
-- the webhook inserts here FIRST, and a duplicate delivery collides on the
-- primary key and stops before it can record a second payment. Stripe retries
-- on any non-2xx, so duplicates are normal traffic, not an edge case.
create table if not exists stripe_events (
  id text primary key,
  type text not null,
  payload jsonb not null,
  status text not null default 'processed'
    check (status in ('processed', 'unmatched', 'ignored', 'error')),
  note text,
  received_at timestamptz default now()
);

-- Money that arrived but could not be matched to a client: someone paid
-- through a raw link with no client_reference_id, under an email we do not
-- have. Parked here rather than dropped, because silently losing a payment is
-- the worst thing this system could do.
create table if not exists stripe_unmatched (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text unique not null,
  stripe_customer_id text,
  customer_email text,
  customer_name text,
  amount numeric not null,
  paid_date date,
  payment_type text check (payment_type in ('setup', 'monthly')),
  payment_method text,
  stripe_invoice_id text,
  description text,
  resolved_client_id uuid references clients(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists stripe_unmatched_open_idx
  on stripe_unmatched (created_at desc)
  where resolved_client_id is null;

-- The two payment link URLs, so they are editable from the app instead of
-- being baked into a build.
create table if not exists app_settings (
  key text primary key,
  value text,
  updated_at timestamptz default now()
);

insert into app_settings (key, value) values
  ('stripe_setup_link', ''),
  ('stripe_monthly_link', '')
on conflict (key) do nothing;

-- These match the rest of the schema, which runs with RLS disabled and the
-- anon key behind an authenticated app shell.
alter table stripe_events disable row level security;
alter table stripe_unmatched disable row level security;
alter table app_settings disable row level security;
