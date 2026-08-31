-- GoHighLevel setup intake, plus the tokenised link that lets a client fill in
-- their own onboarding instead of us reading the questions down a phone call.
--
-- Two things live here:
--   1. ghl_setup        - everything needed to stand up a client's GHL sub-account
--   2. onboarding_links - a per-client secret URL so the client can fill it in
--
-- Why a token and not a login: clients are not CRM users and never will be.
-- The functions at the bottom are `security definer`, take a token, check it,
-- and touch exactly one client's two rows. That is what lets a client fill in
-- a form without an account.
--
-- CORRECTION to this file as first written: it assumed every table here is
-- locked to `authenticated`. They are not. supabase/fix-rls.sql disabled RLS
-- across the board because the app ships no login and runs entirely as `anon`,
-- so `authenticated`-only policies matched nobody and every write failed. The
-- policies below therefore grant `anon` too, or the staff side of this feature
-- reads nothing: OnboardingLinkPanel queries onboarding_links and GhlSetupForm
-- queries ghl_setup, both through the browser's anon key.
--
-- The token is still the client's credential, but it is not a security
-- boundary against anyone holding the anon key (it ships in the built JS) --
-- that person can already read these tables directly. Add a login and the only
-- change needed here is dropping `anon` from the two policies.

-- 1. THE GHL SETUP TABLE ---------------------------------------------------
-- Field list is derived from three evidenced sources, not invented:
--   - the six `TEMPLATE - set per client` custom values in the master snapshot
--   - A2P 10DLC registration, which Ethan named directly ("email address and
--     EIN for A2P")
--   - the sub-account creation form itself (address, timezone, country)
create table if not exists ghl_setup (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,

  -- Sub-account identity
  legal_business_name text,
  dba_name text,
  business_address text,
  business_city text,
  business_state text,
  business_postal_code text,
  business_country text default 'US',
  timezone text,
  main_phone text,
  support_email text,

  -- The area code the client wants on the number their automated texts and
  -- calls send from. A preference, not a guarantee: it is honoured when the
  -- provider has numbers free in that area code.
  preferred_area_code text,

  -- A2P 10DLC registration
  ein text,
  business_entity_type text,
  website_url text,
  privacy_policy_url text,
  terms_url text,
  authorized_rep_name text,
  authorized_rep_email text,
  authorized_rep_phone text,
  sms_opt_in_method text,
  sample_sms_message text,

  -- Master snapshot custom values not already covered above
  booking_url text,
  review_link text,
  service_area text,

  -- Per-client pricing. Free text on purpose: the master's five products are
  -- placeholders and every trade prices differently. Forcing five numeric
  -- fields would invent a structure no client has agreed to.
  service_pricing text,

  -- Ops
  notes text,
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists ghl_setup_client_id_key on ghl_setup(client_id);

-- Added after the table was already live. onboarding_apply reads its columns
-- out of information_schema at call time, so a new column needs nothing else
-- to become writable by the client-facing form.
alter table ghl_setup add column if not exists preferred_area_code text;

-- 2. THE CLIENT LINK -------------------------------------------------------
create table if not exists onboarding_links (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  -- 64 hex chars from two v4 UUIDs. gen_random_uuid() is built in, so this
  -- needs no extension, and there is nothing guessable in it.
  token text not null unique
    default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  revoked boolean not null default false,
  intake_submitted_at timestamptz,
  ghl_submitted_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists onboarding_links_client_id_idx on onboarding_links(client_id);

-- 3. SECURITY --------------------------------------------------------------
-- Same posture as every other table in this project: the app has no login, so
-- the browser is `anon` and has to be granted directly. RLS stays ENABLED with
-- explicit policies rather than switched off, so that moving to a real login
-- later is a one-word edit instead of a rewrite.
alter table ghl_setup enable row level security;
alter table onboarding_links enable row level security;

drop policy if exists "Authenticated users can do everything with ghl_setup" on ghl_setup;
create policy "Authenticated users can do everything with ghl_setup"
  on ghl_setup for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "Authenticated users can do everything with onboarding_links" on onboarding_links;
create policy "Authenticated users can do everything with onboarding_links"
  on onboarding_links for all
  to anon, authenticated
  using (true)
  with check (true);

-- 4. THE PUBLIC DOOR -------------------------------------------------------
-- Resolves a token to a client_id, or raises. Every public function starts
-- here so the check exists in exactly one place.
create or replace function onboarding_link_client(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
begin
  select client_id into v_client_id
  from onboarding_links
  where token = p_token and revoked = false;

  if v_client_id is null then
    raise exception 'invalid_or_revoked_token';
  end if;

  return v_client_id;
end;
$$;

-- Writes a jsonb payload onto one client's row of an intake table.
--
-- Built dynamically on purpose. `onboarding_intake` was created directly in
-- Supabase and has no migration in this repo, so its exact column list is not
-- knowable from the code. Reading the columns out of information_schema at
-- call time means this keeps working when either table gains a field and
-- nobody remembers to come back here.
--
-- It is also the whitelist. A key in the payload that is not a real column on
-- that table is dropped, and id / client_id / created_at are never assignable,
-- so a caller cannot repoint a row at a different client.
create or replace function onboarding_apply(p_table text, p_client_id uuid, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_set text;
  v_exists boolean;
begin
  if p_table not in ('onboarding_intake', 'ghl_setup') then
    raise exception 'table_not_allowed';
  end if;

  select string_agg(
           format('%I = ($1->>%L)::%s', c.column_name, c.column_name, c.data_type),
           ', '
         )
    into v_set
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = p_table
    and c.column_name not in ('id', 'client_id', 'created_at')
    and c.column_name in (select jsonb_object_keys(p_data));

  execute format('select exists(select 1 from %I where client_id = $1)', p_table)
    into v_exists using p_client_id;

  if not v_exists then
    execute format('insert into %I (client_id) values ($1)', p_table) using p_client_id;
  end if;

  if v_set is not null then
    execute format('update %I set %s where client_id = $2', p_table, v_set)
      using p_data, p_client_id;
  end if;
end;
$$;

-- Loads what the client needs to see: who they are, and whatever they have
-- already filled in, so a half-finished form is never lost.
create or replace function onboarding_link_load(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_result jsonb;
begin
  v_client_id := onboarding_link_client(p_token);

  select jsonb_build_object(
    'client_name', c.name,
    'intake', coalesce(to_jsonb(i.*) - 'id' - 'client_id', '{}'::jsonb),
    'ghl', coalesce(to_jsonb(g.*) - 'id' - 'client_id', '{}'::jsonb),
    'intake_submitted_at', l.intake_submitted_at,
    'ghl_submitted_at', l.ghl_submitted_at
  )
  into v_result
  from clients c
  join onboarding_links l on l.client_id = c.id and l.token = p_token
  left join onboarding_intake i on i.client_id = c.id
  left join ghl_setup g on g.client_id = c.id
  where c.id = v_client_id;

  return v_result;
end;
$$;

create or replace function onboarding_link_save_intake(p_token text, p_data jsonb, p_submit boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
begin
  v_client_id := onboarding_link_client(p_token);
  perform onboarding_apply('onboarding_intake', v_client_id, p_data);

  if p_submit then
    update onboarding_links set intake_submitted_at = now() where token = p_token;
  end if;
end;
$$;

create or replace function onboarding_link_save_ghl(p_token text, p_data jsonb, p_submit boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
begin
  v_client_id := onboarding_link_client(p_token);
  perform onboarding_apply('ghl_setup', v_client_id, p_data || jsonb_build_object('updated_at', now()));

  if p_submit then
    update ghl_setup set completed_at = now() where client_id = v_client_id;
    update onboarding_links set ghl_submitted_at = now() where token = p_token;
  end if;
end;
$$;

-- anon can call these three and nothing else.
grant execute on function onboarding_link_load(text) to anon, authenticated;
grant execute on function onboarding_link_save_intake(text, jsonb, boolean) to anon, authenticated;
grant execute on function onboarding_link_save_ghl(text, jsonb, boolean) to anon, authenticated;

-- Internal plumbing for the three above. Anon has no reason to resolve a token
-- to a raw client id, or to write to a table without a token check.
--
-- These MUST revoke from PUBLIC, not just from anon. Postgres grants EXECUTE on
-- every new function to PUBLIC, and anon inherits it there -- so `revoke ...
-- from anon` alone removes a grant anon never held directly and changes
-- nothing. As first written this left onboarding_apply() reachable over
-- PostgREST: it is `security definer` and takes a client_id with no token
-- check, i.e. a way to write any client's intake without holding a link.
--
-- Safe for the three wrappers above: they are `security definer`, so their
-- internal calls to these two run as the function owner, not as the caller.
revoke execute on function onboarding_link_client(text) from public;
revoke execute on function onboarding_link_client(text) from anon;
revoke execute on function onboarding_link_client(text) from authenticated;

revoke execute on function onboarding_apply(text, uuid, jsonb) from public;
revoke execute on function onboarding_apply(text, uuid, jsonb) from anon;
revoke execute on function onboarding_apply(text, uuid, jsonb) from authenticated;
