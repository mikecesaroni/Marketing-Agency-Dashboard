-- Marketing Agency Dashboard — database setup
-- Paste this whole file into the Supabase SQL Editor and click "Run".
-- Safe to run once on a fresh project.

-- 1. CLIENTS -----------------------------------------------------------
create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  industry text,
  market text,
  monthly_budget numeric,
  status text not null default 'onboarding'
    check (status in ('active', 'paused', 'onboarding', 'churned')),
  meta_ads_active boolean not null default false,
  lsa_active boolean not null default false,
  setup_fee numeric default 0,
  monthly_fee numeric default 998,
  contract_start_date date,
  date_added date not null default current_date
);

-- 2. ONBOARDING TASKS ----------------------------------------------------
create table onboarding_tasks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  task_name text not null,
  done boolean not null default false,
  date_completed date
);

-- 3. WEEKLY KPIS -----------------------------------------------------
-- Cost per lead is NOT stored here — the app calculates it as ad_spend / leads.
create table weekly_kpis (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  week_of date not null,
  ad_spend numeric not null default 0,
  leads integer not null default 0,
  channel text not null check (channel in ('Meta', 'LSA')),
  notes text
);

-- 4. WEEKLY WORK LOG -----------------------------------------------------
create table weekly_work_log (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  week_of date not null,
  work_summary text not null
);

-- 5. CREATIVE LOG -----------------------------------------------------
create table creative_log (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  date date not null default current_date,
  description text not null,
  status text not null default 'in progress'
    check (status in ('in progress', 'live', 'retired'))
);

-- 6. PAYMENTS (setup fee + monthly recurring) --------------------------------
create table payments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  payment_type text not null check (payment_type in ('setup', 'monthly')),
  amount numeric not null,
  due_date date not null,
  paid_date date,
  status text not null default 'pending' check (status in ('pending', 'paid', 'overdue')),
  payment_method text,
  notes text,
  created_at timestamp default current_timestamp
);

-- 7. CLIENT FILES (logos, documents, assets) ----------------------------
create table client_files (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  file_name text not null,
  file_type text not null,
  file_size integer not null,
  storage_path text not null,
  date_uploaded timestamp not null default current_timestamp,
  description text
);

-- 8. AUTO-CREATE ONBOARDING CHECKLIST ------------------------------------
-- Whenever a new client is added, automatically create their 14-item
-- onboarding checklist so you never have to add it by hand.
create function create_onboarding_tasks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into onboarding_tasks (client_id, task_name)
  values
    (new.id, 'Signed agreement received'),
    (new.id, 'Access to Meta Business Manager granted'),
    (new.id, 'Access to Google LSA account granted'),
    (new.id, 'Facebook Page + Instagram connected'),
    (new.id, 'Meta pixel / conversions API installed'),
    (new.id, 'LSA profile verified, license/insurance uploaded'),
    (new.id, 'Kickoff call completed'),
    (new.id, 'Collect owner video'),
    (new.id, 'Offer / promo confirmed'),
    (new.id, 'First creative batch produced (Higgsfield)'),
    (new.id, 'First Meta campaign live'),
    (new.id, 'LSA budget live'),
    (new.id, 'Lead tracking confirmed with client'),
    (new.id, 'Week 1 report sent');
  return new;
end;
$$;

create trigger on_client_created
  after insert on clients
  for each row
  execute function create_onboarding_tasks();

-- 9. SECURITY (Row Level Security) ---------------------------------------
-- This locks every table down so only someone logged in (you) can read or
-- write data. Nobody logged out can see anything.
alter table clients enable row level security;
alter table onboarding_tasks enable row level security;
alter table weekly_kpis enable row level security;
alter table weekly_work_log enable row level security;
alter table creative_log enable row level security;
alter table payments enable row level security;
alter table client_files enable row level security;

create policy "Authenticated users can do everything with clients"
  on clients for all
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can do everything with onboarding_tasks"
  on onboarding_tasks for all
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can do everything with weekly_kpis"
  on weekly_kpis for all
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can do everything with weekly_work_log"
  on weekly_work_log for all
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can do everything with creative_log"
  on creative_log for all
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can do everything with payments"
  on payments for all
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can do everything with client_files"
  on client_files for all
  to authenticated
  using (true)
  with check (true);
