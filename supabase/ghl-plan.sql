-- Whether we are building this client's GoHighLevel, and whether it is running.
--
-- Two columns rather than one, and that is the whole point. Meta and LSA get
-- away with a single boolean because every client is sold both: lsa_active =
-- false unambiguously means "not live yet, go and do it". GHL is an opt-in, so
-- a single flag would collapse two completely different situations into one --
-- "not doing GHL with us" and "doing GHL, not built yet" -- and the second is
-- work sitting in a queue while the first must never appear in one.
--
-- ghl_plan is the commercial fact: are they buying the build.
-- ghl_active is the delivery fact: is it live.
--
-- Everything between those two is DERIVED rather than tracked. The ghl_setup
-- table and GHL_REQUIRED_KEYS already say whether the client has given us the
-- EIN, the legal name and the timezone, so "waiting on the client" versus
-- "ready for us to build" is computed from data that already exists. A third
-- status column would only be a thing to keep in sync by hand, and the first
-- time somebody forgot, it would be a lie.
alter table public.clients
  add column if not exists ghl_plan boolean not null default false;

alter table public.clients
  add column if not exists ghl_active boolean not null default false;

comment on column public.clients.ghl_plan is
  'Client is buying the GoHighLevel build from us. Off for clients who run their own.';
comment on column public.clients.ghl_active is
  'Their GoHighLevel sub-account is built and running. Only meaningful when ghl_plan is true.';

-- A client whose GHL is live is on the plan by definition, so the pair can
-- never contradict itself no matter which switch gets flipped first.
alter table public.clients
  drop constraint if exists clients_ghl_active_requires_plan;
alter table public.clients
  add constraint clients_ghl_active_requires_plan
  check (ghl_active = false or ghl_plan = true);

-- Finding the queue is the common read: everyone on the plan who is not live.
create index if not exists clients_ghl_queue_idx
  on public.clients (ghl_plan, ghl_active) where ghl_plan;
