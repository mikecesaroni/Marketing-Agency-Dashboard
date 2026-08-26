-- Payout reconciliation: has Ethan actually received his cut of a payment yet.
--
-- This is a second, separate question from payments.status. status = 'paid'
-- means the client paid the agency, through Stripe or otherwise. It says
-- nothing about whether that money has since been split and sent out to
-- Ethan. Both questions live on the same row because they are both facts
-- about the same dollar, on different dates.

alter table payments add column if not exists ethan_paid_out boolean not null default false;
alter table payments add column if not exists ethan_paid_out_date date;
-- The split percentage below is only a suggestion for what to send. What
-- actually got sent — after rounding, a fee, a manual adjustment — is locked
-- in here at the moment a row is marked, so a later change to the split
-- percent can't quietly rewrite history.
alter table payments add column if not exists ethan_payout_amount numeric;

-- The panel's main query is "which paid payments still owe Ethan a cut" —
-- this is that filter.
create index if not exists payments_ethan_payout_idx
  on payments (ethan_paid_out)
  where status = 'paid';

-- Reuses the same key/value settings table the Stripe payment links live in.
insert into app_settings (key, value) values
  ('ethan_split_percent', '50')
on conflict (key) do nothing;
