-- AI ad concepts: batches of finished ads made by Higgsfield's Ads Studio
-- from the Studio's brief, so a client's ads stop looking like one template.
--
-- One row per batch. The ad-concepts function submits it, the Studio polls
-- it, and when the images are in they are copied into the client-files
-- bucket under concepts/<client>/ (never ads/, which is the saved-ad
-- prefix) and listed in `paths`. A pick becomes the Studio's "AI concept"
-- look and is saved, approved and published like any other ad.
--
-- Also here: the saved_ads layout check now allows the newer looks
-- (stack, plate, split, ai) beside cover and card.
--
-- Run this whole file in the SQL editor. Safe to re-run.

create table if not exists ad_concepts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  request_id text,
  status text not null default 'queued' check (status in ('queued', 'working', 'done', 'failed')),
  aspect text not null default '4:5',
  batch int not null default 4,
  brief jsonb not null default '{}',
  prompt text,
  ref_paths text[] not null default '{}',
  paths text[] not null default '{}',
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ad_concepts_client_idx on ad_concepts (client_id, created_at desc);

alter table ad_concepts enable row level security;
grant select, insert, update, delete on ad_concepts to anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'ad_concepts' and policyname = 'anon_open_while_login_off') then
    execute 'create policy anon_open_while_login_off on ad_concepts for all to anon using (true) with check (true)';
  end if;
  if not exists (select 1 from pg_policies where tablename = 'ad_concepts' and policyname = 'staff_all') then
    execute 'create policy staff_all on ad_concepts for all to authenticated using (true) with check (true)';
  end if;
end $$;

-- The looks a saved ad may carry. The constraint is replaced rather than
-- altered because Postgres cannot edit a check in place.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'saved_ads_layout_check') then
    execute 'alter table saved_ads drop constraint saved_ads_layout_check';
  end if;
  execute 'alter table saved_ads add constraint saved_ads_layout_check check (layout = any (array[''cover'',''card'',''stack'',''plate'',''split'',''ai'']))';
end $$;
