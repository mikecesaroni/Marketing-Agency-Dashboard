-- The client's billing page: the Billing tab of their one link (/pay/<token>).
--
-- "Make a branded payments page from the client portal where clients can pay
-- the setup fee and subscribe to the Stripe payment" (2026-11-09). The page
-- shows the client their plan, whether the setup fee is paid, whether the
-- subscription has started, and the Stripe link to pay or to subscribe,
-- stamped with their id so the webhook books the money to them. The token in
-- the link is the credential, the same dashboard token as their other tabs.
-- The page reads through client_billing_load and nothing else; it changes
-- nothing. Stripe's own checkout takes the card; the webhook keeps the books.
--
-- Run this whole file in the SQL editor. Safe to re-run.

-- 1. A client's own Stripe links, for a fee no standard link charges (a
--    $1,750 plan, a split setup fee). Pasted on the client's Payments card.
alter table clients add column if not exists pay_setup_link text;
alter table clients add column if not exists pay_monthly_link text;
comment on column clients.pay_setup_link is 'A Stripe Payment Link for this client''s setup fee, when the standard one charges a different amount. The Billing tab offers it.';
comment on column clients.pay_monthly_link is 'A Stripe Payment Link for this client''s monthly plan, when their fee is not one of the standard prices. The Billing tab offers it.';

-- 2. What the standard setup link charges, so the Billing tab offers it only
--    to a client who owes exactly that. Every setup fee on the books is
--    $2,500, so that is the starting value; the Payments page's Stripe box
--    changes it.
insert into app_settings (key, value, updated_at)
values ('stripe_setup_link_amount', '2500', now())
on conflict (key) do nothing;

-- 3. Everything the Billing tab shows, in one call: the client's plan, their
--    payments (the CRM's ledger, which the webhook keeps), their contact
--    email (prefilled on the Stripe checkout) and the Stripe links.
create or replace function client_billing_load(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with c as (
    select id, name, setup_fee, monthly_fee, tier, paused_at, archived, pay_setup_link, pay_monthly_link
    from clients
    where dashboard_token = p_token and length(p_token) >= 20 and archived = false
    limit 1
  ),
  p as (
    select payment_type, amount, due_date, paid_date, status, failure_count, next_attempt_at, stripe_hosted_invoice_url
    from payments
    where client_id = (select id from c)
  ),
  s as (
    select key, value
    from app_settings
    where key in ('stripe_setup_link', 'stripe_setup_link_amount', 'stripe_monthly_link', 'stripe_monthly_1500_link', 'stripe_monthly_2500_link', 'stripe_monthly_3500_link')
  )
  select case when (select id from c) is null then null else jsonb_build_object(
    'client', (select jsonb_build_object(
      'id', id, 'name', name, 'setup_fee', setup_fee, 'monthly_fee', monthly_fee, 'tier', tier,
      'paused_at', paused_at, 'pay_setup_link', pay_setup_link, 'pay_monthly_link', pay_monthly_link
    ) from c),
    'email', (select contact_email from onboarding_intake where client_id = (select id from c) limit 1),
    'payments', coalesce((select jsonb_agg(to_jsonb(p)) from p), '[]'::jsonb),
    'links', coalesce((select jsonb_object_agg(key, coalesce(value, '')) from s), '{}'::jsonb),
    'generated_at', now()
  ) end;
$$;
revoke all on function client_billing_load(text) from public;
grant execute on function client_billing_load(text) to anon, authenticated;

-- 4. The link preview for /pay/<token> shows the business name, through the
--    same lookup the other tabs use (first written in client-dashboard.sql;
--    this is the whole definition).
create or replace function client_link_name(p_kind text, p_token text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_kind in ('dashboard', 'scripts', 'videos', 'pay') then (select name from clients where dashboard_token = p_token and archived = false and length(p_token) >= 20 limit 1)
    when p_kind = 'report' then (select c.name from weekly_reports w join clients c on c.id = w.client_id where w.token = p_token and length(p_token) >= 20 limit 1)
    else null
  end;
$$;
revoke all on function client_link_name(text, text) from public;
grant execute on function client_link_name(text, text) to anon, authenticated;
