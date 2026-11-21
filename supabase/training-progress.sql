-- Training progress: how far each person has got through each module.
--
-- The Training page saves a row every time somebody moves on a card, so
-- closing the tab loses nothing and they pick up where they stopped. One row
-- per person per module; the modules themselves live in the code
-- (src/lib/training).
--
-- `version` is the module version the person FINISHED. When a module is
-- rewritten because the thing it teaches changed, its version goes up in the
-- code and everybody holding an older one sees "Updated" on it.
--
-- No foreign key to auth.users, and the name is copied in, for the same
-- reason as quiz_attempts: removing a login must not erase the record that
-- the person was trained.
--
-- Safe to run more than once.

create table if not exists public.training_progress (
  user_id uuid not null default auth.uid(),
  -- '<course>/<module>', for example 'google/lsa'.
  module_key text not null,
  name text,
  -- Cards got through, and how many the module had at the time.
  step integer not null default 0,
  total integer not null default 0,
  done boolean not null default false,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (user_id, module_key)
);

alter table public.training_progress enable row level security;

-- Everybody reads and writes only their own progress; an admin can also read
-- everyone's, for the team board. Nobody can delete: progress is a record.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'training_progress' and policyname = 'training_progress_read'
  ) then
    create policy training_progress_read on public.training_progress
      for select to authenticated
      using (user_id = auth.uid() or public.is_admin());
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'training_progress' and policyname = 'training_progress_add'
  ) then
    create policy training_progress_add on public.training_progress
      for insert to authenticated
      with check (user_id = auth.uid());
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'training_progress' and policyname = 'training_progress_change'
  ) then
    create policy training_progress_change on public.training_progress
      for update to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;
end $$;
