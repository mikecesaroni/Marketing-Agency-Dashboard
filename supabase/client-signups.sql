-- Signup links: one link a new client pays through, then fills in the
-- onboarding form, and lands in the CRM without anybody adding them.
--
-- "Get a link where the client can pay the setup and monthly subscription
-- based on the tier I click, then when that is paid they fill out the
-- onboarding form, then they show up as a new client in the CRM"
-- (2026-11-27). docs/client-signup.md has the whole flow.
--
-- A signup is NOT a client. Nothing is on the Clients list, the tiers, the
-- brief or the books until money arrives. The Stripe links on the signup
-- page carry the SIGNUP's id as client_reference_id; the webhook finds no
-- client with that id, asks client_signup_claim, and that makes the client
-- (with the plan, the fees, a billing schedule and an onboarding form link)
-- in the same breath as booking the payment. From then on it is an ordinary
-- client.
--
-- Run this whole file in the SQL editor. Safe to re-run.

-- 1. The links.
create table if not exists public.client_signups (
  -- Rides to Stripe as client_reference_id, so the webhook can find it.
  id uuid primary key default gen_random_uuid(),
  -- The credential in the link (/join/<token>).
  token text not null unique default encode(gen_random_bytes(18), 'hex'),
  business_name text not null,
  -- Optional: typed into Stripe's checkout for them.
  contact_email text,
  tier smallint not null check (tier in (1, 2, 3)),
  monthly_fee numeric not null check (monthly_fee > 0),
  -- 0 when the setup fee is waived.
  setup_fee numeric not null default 0 check (setup_fee >= 0),
  created_by text,
  created_at timestamptz not null default now(),
  -- The first time the link was opened.
  opened_at timestamptz,
  -- Set by client_signup_claim when the first payment lands.
  client_id uuid references public.clients (id) on delete set null,
  claimed_at timestamptz,
  -- Set by the CRM once it has told the channel and made the onboarding
  -- tasks for the new client (src/lib/clientSignupStore.js).
  finished_at timestamptz,
  -- A cancelled link opens as "not valid".
  revoked boolean not null default false
);

create index if not exists client_signups_client_idx on public.client_signups (client_id);

alter table public.client_signups enable row level security;

-- The team reads and writes them; a client page goes through the token
-- function below and reaches no table.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'client_signups' and policyname = 'client_signups_staff_all'
  ) then
    create policy client_signups_staff_all on public.client_signups
      for all to authenticated
      using (true) with check (true);
  end if;
end $$;

-- 2. Where a signup stands: which payments are in, and whether the form is.
--    One definition, read by the signup page and by the CRM's list.
create or replace function public.client_signup_state(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'client_id', s.client_id,
    'setup_paid', s.setup_fee <= 0 or coalesce((
      select sum(p.amount) from payments p
      where p.client_id = s.client_id and p.payment_type = 'setup' and p.status = 'paid'
    ), 0) >= s.setup_fee - 0.5,
    'setup_paid_on', (
      select max(p.paid_date) from payments p
      where p.client_id = s.client_id and p.payment_type = 'setup' and p.status = 'paid'
    ),
    'monthly_started', exists (
      select 1 from payments p
      where p.client_id = s.client_id and p.payment_type = 'monthly' and p.status = 'paid'
    ),
    'monthly_started_on', (
      select min(p.paid_date) from payments p
      where p.client_id = s.client_id and p.payment_type = 'monthly' and p.status = 'paid'
    ),
    'form_submitted_at', (
      select max(l.intake_submitted_at) from onboarding_links l where l.client_id = s.client_id
    )
  )
  from client_signups s
  where s.id = p_id;
$$;
revoke all on function public.client_signup_state(uuid) from public;
revoke all on function public.client_signup_state(uuid) from anon;
grant execute on function public.client_signup_state(uuid) to authenticated, service_role;

-- 3. Everything the signup page shows, by the token in the link: the plan,
--    what is paid, the Stripe links, and the onboarding form's own link once
--    both payments are in. Null for a token that is not a live signup.
create or replace function public.client_signup_load(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s client_signups%rowtype;
  st jsonb;
  paid boolean;
begin
  if p_token is null or length(p_token) < 20 then
    return null;
  end if;
  select * into s from client_signups where token = p_token and revoked = false;
  if not found then
    return null;
  end if;
  if s.opened_at is null then
    update client_signups set opened_at = now() where id = s.id;
  end if;

  st := client_signup_state(s.id);
  paid := (st->>'setup_paid')::boolean and (st->>'monthly_started')::boolean;

  return jsonb_build_object(
    'signup', jsonb_build_object(
      'id', s.id, 'business_name', s.business_name, 'contact_email', s.contact_email,
      'tier', s.tier, 'monthly_fee', s.monthly_fee, 'setup_fee', s.setup_fee
    ),
    'state', st - 'client_id',
    -- The form opens only once the money is in.
    'onboarding_token', case when paid then (
      select l.token from onboarding_links l
      where l.client_id = s.client_id and l.revoked = false
      order by l.created_at desc limit 1
    ) end,
    'links', coalesce((
      select jsonb_object_agg(a.key, coalesce(a.value, '')) from app_settings a
      where a.key in ('stripe_setup_link', 'stripe_setup_link_amount', 'stripe_monthly_link', 'stripe_monthly_1500_link', 'stripe_monthly_2500_link', 'stripe_monthly_3500_link')
    ), '{}'::jsonb),
    'generated_at', now()
  );
end;
$$;
revoke all on function public.client_signup_load(text) from public;
grant execute on function public.client_signup_load(text) to anon, authenticated;

-- 4. The first payment on a signup makes the client. Called by the Stripe
--    webhook (the service key) with the client_reference_id it could not
--    find a client for. Returns { client_id, created }, or null when the id
--    is not a signup, so the webhook carries on as it always has.
--
--    The row is locked, so the setup fee and the subscription arriving
--    together make one client, not two. A cancelled link still makes the
--    client: money that arrived is never left without somebody to book it to.
create or replace function public.client_signup_claim(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s client_signups%rowtype;
  v_client uuid;
  v_day date := current_date;
begin
  select * into s from client_signups where id = p_id for update;
  if not found then
    return null;
  end if;

  if s.client_id is not null and exists (select 1 from clients where id = s.client_id) then
    return jsonb_build_object('client_id', s.client_id, 'created', false);
  end if;

  insert into clients (name, tier, monthly_fee, setup_fee, meta_budget_per_day, lsa_budget_per_day)
  values (s.business_name, s.tier, s.monthly_fee, s.setup_fee, 0, 0)
  returning id into v_client;

  -- The onboarding form, ready for the signup page to hand over.
  insert into onboarding_links (client_id) values (v_client);

  -- The schedule the webhook ticks off: the setup fee when there is one,
  -- and twelve months from today (the same rows Billing Setup writes).
  if s.setup_fee > 0 then
    insert into payments (client_id, payment_type, amount, due_date, status)
    values (v_client, 'setup', s.setup_fee, v_day, 'pending');
  end if;
  insert into payments (client_id, payment_type, amount, due_date, status)
  select v_client, 'monthly', s.monthly_fee, (v_day + make_interval(months => m))::date, 'pending'
  from generate_series(0, 11) as m;

  update client_signups set client_id = v_client, claimed_at = now() where id = s.id;

  return jsonb_build_object('client_id', v_client, 'created', true);
end;
$$;
revoke all on function public.client_signup_claim(uuid) from public;
revoke all on function public.client_signup_claim(uuid) from anon;
revoke all on function public.client_signup_claim(uuid) from authenticated;
grant execute on function public.client_signup_claim(uuid) to service_role;

-- 5. The CRM's list: every link with where it stands, newest first.
--    Runs as the caller, so the table's own policy decides who reads it.
create or replace function public.client_signups_list()
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(s) || jsonb_build_object('state', client_signup_state(s.id)) order by s.created_at desc), '[]'::jsonb)
  from client_signups s;
$$;
revoke all on function public.client_signups_list() from public;
revoke all on function public.client_signups_list() from anon;
grant execute on function public.client_signups_list() to authenticated;

-- 6. The link preview for /join/<token> names the business, through the
--    same lookup the client's other links use (this is the whole
--    definition; it was last written in client-billing.sql).
create or replace function public.client_link_name(p_kind text, p_token text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_kind in ('dashboard', 'scripts', 'videos', 'pay') then (select name from clients where dashboard_token = p_token and archived = false and length(p_token) >= 20 limit 1)
    when p_kind = 'report' then (select c.name from weekly_reports w join clients c on c.id = w.client_id where w.token = p_token and length(p_token) >= 20 limit 1)
    when p_kind = 'join' then (select business_name from client_signups where token = p_token and revoked = false and length(p_token) >= 20 limit 1)
    else null
  end;
$$;
revoke all on function public.client_link_name(text, text) from public;
grant execute on function public.client_link_name(text, text) to anon, authenticated;
