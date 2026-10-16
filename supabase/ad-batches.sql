-- The batch waits for you.
--
-- "Make 3 ads" writes three ads into the Ad Studio's strip. Until now they
-- lived only in the open Studio: close it without saving and they were
-- gone. This table keeps the last batch made for each client, with every
-- edit made on its sets, so the Studio reopens with the same three on the
-- strip whether that is a minute or a week later. One row per client: a
-- new batch replaces the old one; saving all three, or "Forget these",
-- deletes the row. The sets are the Studio's own set objects (the fields in
-- src/lib/adBatch.js SET_FIELDS plus the chat's angle and notes) as JSON.
--
-- Run in the SQL editor. Safe to re-run. Already applied to the project.

create table if not exists ad_batches (
  client_id uuid primary key references clients(id) on delete cascade,
  sets jsonb not null default '[]'::jsonb,
  active integer not null default 0,
  count integer not null default 3,
  made_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Same posture as the rest of this project: the app talks to Supabase as
-- anon and there is no per-user auth, so RLS is off (see fix-rls.sql).
alter table ad_batches disable row level security;
