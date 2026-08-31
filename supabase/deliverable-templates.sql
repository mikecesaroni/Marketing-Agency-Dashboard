-- Launch deliverables that create themselves.
--
-- Run this whole file once in the Supabase SQL Editor. Safe to run twice.
-- Supersedes supabase/default-deliverables.sql, which is superseded for a
-- reason worth writing down.
--
-- WHY THE LAST ATTEMPT AT THIS FAILED
--
-- There have been two goes at seeding a standard checklist. The onboarding
-- checklist in client_tasks was deleted by clear-legacy-onboarding-tasks.sql
-- because it was "cluttering every client's task list", and that cleanup had
-- to find its own rows by guessing -- counting how many clients shared a
-- title -- because nothing recorded which rows were seeded and which somebody
-- typed. default-deliverables.sql was never run at all, and its own comment
-- admits the flaw: "one you finished and deleted doesn't come back... it does,
-- actually."
--
-- So three rules here, each one aimed at a specific way this dies:
--
--   1. SEEDED ROWS SAY SO. source = 'auto' and a template_key. A future
--      cleanup is one exact DELETE, not an archaeology exercise.
--   2. A SET IS SEEDED ONCE, EVER. The deliverable_seeds ledger records the
--      event, so deleting an item and re-toggling the plan does not bring it
--      back. Deleting a seeded deliverable is a decision, and it sticks.
--   3. NOTHING ASKS YOU TO TICK WHAT THE CRM CAN ALREADY SEE. Connecting the
--      ad account and switching Meta live are flags on the client, so those
--      two deliverables complete themselves. Busywork is what killed the last
--      checklist.
--
-- And no due dates. Inventing deadlines would turn the dashboard red for dates
-- nobody chose -- the one thing the previous attempt got right.

-- 1. COLUMNS ---------------------------------------------------------------

-- 'access' is getting into the client's ad account, which is genuinely
-- separate work from going live with a campaign in it -- one is a permission
-- someone else has to grant, the other is our own doing. 'ghl setup' was
-- already offered by the form's Type dropdown while the constraint rejected
-- it, so saving one failed; that is fixed here rather than by removing the
-- option.
alter table deliverables drop constraint if exists deliverables_type_check;
alter table deliverables add constraint deliverables_type_check
  check (type in (
    'access', 'creative', 'campaign', 'report', 'landing page',
    'ghl setup', 'automation', 'other'
  ));

alter table deliverables
  -- 'auto' means this file made it. Anything a person typed stays 'manual',
  -- which is the default so an untouched INSERT from the form is correct.
  add column if not exists source text not null default 'manual',
  -- Stable slug per template. Null for hand-typed work.
  add column if not exists template_key text,
  -- Launch order, not priority. These are a sequence: no creatives without
  -- account access, no SMS automation before A2P clears.
  add column if not exists sort_order integer not null default 500,
  -- Which build this belongs to, for grouping on the page.
  add column if not exists phase text;

alter table deliverables drop constraint if exists deliverables_source_check;
alter table deliverables add constraint deliverables_source_check
  check (source in ('manual', 'auto'));

-- One row per template per client. This is what makes re-running anything
-- here harmless.
create unique index if not exists deliverables_client_template_key
  on deliverables (client_id, template_key)
  where template_key is not null;

create index if not exists deliverables_sort_order_idx on deliverables (sort_order);

-- 2. THE LEDGER ------------------------------------------------------------
-- Separate from deliverables on purpose. If this lived in the deliverables
-- table, deleting a row would erase the record that it was ever seeded, and
-- the next toggle would put it straight back.
create table if not exists deliverable_seeds (
  client_id uuid not null references clients(id) on delete cascade,
  set_name text not null,
  seeded_at timestamptz not null default now(),
  primary key (client_id, set_name)
);

alter table deliverable_seeds disable row level security;

-- 3. SEEDING ---------------------------------------------------------------
-- The templates live here, in one function, rather than in a table nobody
-- would ever edit or in JavaScript the triggers cannot reach.
create or replace function seed_deliverable_set(p_client_id uuid, p_set text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer := 0;
  v_ok boolean;
begin
  -- Checked before the ledger is touched. A typo in a set name must not claim
  -- a ledger row, because that row would then block the real set forever.
  if p_set not in ('meta', 'ghl') then
    raise exception 'unknown deliverable set: %', p_set;
  end if;

  -- Internal businesses are not clients: no billing, no deliverables. Same
  -- rule internal-businesses.sql states.
  select not coalesce(is_internal, false) and not coalesce(archived, false)
    into v_ok
  from clients where id = p_client_id;

  if not coalesce(v_ok, false) then
    return 0;
  end if;

  -- Rule 2. Claiming the ledger row first means a concurrent call does
  -- nothing rather than doubling up.
  insert into deliverable_seeds (client_id, set_name)
  values (p_client_id, p_set)
  on conflict do nothing;

  if not found then
    return 0;
  end if;

  insert into deliverables (
    client_id, title, type, status, source, template_key, sort_order, phase, notes
  )
  select p_client_id, t.title, t.type, 'todo', 'auto', t.key, t.sort_order, t.phase, t.notes
  from (
    values
      -- META. Every client gets these, because every client is here for ads.
      ('meta-access', 'Get access to their Meta ad account', 'access', 10, 'Meta',
       'Ask them for Partner access to the ad account and the Page. Completes itself once the ad account is connected on the client page.'),
      ('meta-video', 'Make the video ad', 'creative', 20, 'Meta', null),
      ('meta-statics', 'Make 4 static ads', 'creative', 30, 'Meta', null),
      ('meta-live', 'Go live with the first Meta campaign', 'campaign', 40, 'Meta',
       'Separate from having access. Completes itself when Meta ads are switched live on the client page.'),

      -- GOHIGHLEVEL. Only for clients who bought it, seeded when the GHL
      -- build switch goes on. A2P is first because it is the long pole:
      -- carrier approval takes about a week and nothing can text until it
      -- clears.
      ('ghl-a2p', 'A2P registration', 'ghl setup', 110, 'GoHighLevel',
       'Needs the EIN and legal name off their GHL setup form. About a week for carrier approval, so file it before anything that sends a text.'),
      ('ghl-template', 'GoHighLevel template setup', 'ghl setup', 120, 'GoHighLevel',
       'Load the master snapshot and fill in the per-client custom values from their setup form.'),
      ('ghl-meta-form', 'Meta form automation setup', 'automation', 130, 'GoHighLevel',
       'Instant-form leads from Meta into GHL, so a lead is followed up without anyone watching Ads Manager.'),
      ('ghl-sms', 'SMS automation setup', 'automation', 140, 'GoHighLevel',
       'Blocked until A2P is approved. Sending before that gets messages dropped by the carrier, silently.')
  ) as t(key, title, type, sort_order, phase, notes)
  where t.key like case p_set when 'meta' then 'meta-%' when 'ghl' then 'ghl-%' else '' end
  on conflict do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

-- 4. TRIGGERS --------------------------------------------------------------

-- A trigger rather than code in the form, because ghl_plan is written from
-- more than one place -- the switch on the client page today, and the chat
-- tomorrow. A trigger cannot be forgotten by a path that did not exist when
-- this was written.
create or replace function on_client_seed_deliverables()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform seed_deliverable_set(new.id, 'meta');
    if coalesce(new.ghl_plan, false) then
      perform seed_deliverable_set(new.id, 'ghl');
    end if;
    return new;
  end if;

  -- Only the transition. An UPDATE that touches something else entirely must
  -- not re-run this.
  if coalesce(new.ghl_plan, false) and not coalesce(old.ghl_plan, false) then
    perform seed_deliverable_set(new.id, 'ghl');
  end if;

  -- Un-archiving a client is the moment their work matters again, and they may
  -- have been archived before this file existed.
  if not coalesce(new.archived, false) and coalesce(old.archived, false) then
    perform seed_deliverable_set(new.id, 'meta');
    if coalesce(new.ghl_plan, false) then
      perform seed_deliverable_set(new.id, 'ghl');
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists on_client_created_deliverables on clients;
drop trigger if exists on_client_seed_deliverables on clients;

create trigger on_client_seed_deliverables
  after insert or update on clients
  for each row
  execute function on_client_seed_deliverables();

-- Rule 3. The CRM already knows these two, so it says so itself.
--
-- Deliberately narrow: only where a flag maps exactly to one deliverable.
-- ghl_active going live does NOT complete the four GHL items, because "the
-- account is live" is not the same claim as "the SMS automation is built" and
-- pretending otherwise would make the list lie.
create or replace function on_client_complete_deliverables()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_done text[] := '{}';
begin
  -- array_append, not the || operator. With an untyped string literal
  -- `text[] || 'meta-access'` resolves to anyarray||anyarray and Postgres
  -- tries to read the string as an array literal:
  --   malformed array literal: "meta-access"
  -- Found by running the trigger against a throwaway client before touching
  -- anybody real.
  if new.meta_ad_account_id is not null and old.meta_ad_account_id is null then
    v_done := array_append(v_done, 'meta-access');
  end if;

  if coalesce(new.meta_ads_active, false) and not coalesce(old.meta_ads_active, false) then
    v_done := array_append(v_done, 'meta-live');
  end if;

  if array_length(v_done, 1) is null then
    return new;
  end if;

  -- source = 'auto' so a deliverable somebody retitled or created by hand is
  -- never silently closed underneath them.
  update deliverables
     set status = 'done',
         completed_date = current_date
   where client_id = new.id
     and source = 'auto'
     and template_key = any (v_done)
     and status <> 'done';

  return new;
end;
$$;

drop trigger if exists on_client_complete_deliverables on clients;

create trigger on_client_complete_deliverables
  after update on clients
  for each row
  execute function on_client_complete_deliverables();
