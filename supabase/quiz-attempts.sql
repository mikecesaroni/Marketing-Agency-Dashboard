-- Quiz attempts: who took which training quiz, and whether they passed.
--
-- The Training page (src/pages/TrainingPage.jsx) writes one row each time
-- somebody submits a quiz. The questions live in the code
-- (src/lib/fieldServicesQuiz.js); this table only keeps the result, with the
-- quiz's versioned id so an old pass stays a record of what was asked then.
--
-- A record, not a draft: there is no update or delete policy on purpose.
-- Somebody who fails takes it again and both rows stay.
--
-- No foreign key to auth.users, and the name is copied in: removing a login
-- from the Team page must not erase the fact that the person was certified.
--
-- Safe to run more than once.

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  name text,
  quiz_id text not null,
  score integer not null,
  total integer not null,
  passed boolean not null default false,
  -- The ids of the questions answered wrong, so the weekly review can see
  -- which question everybody misses (a bad question, or a gap in the SOP).
  wrong jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists quiz_attempts_quiz_idx on public.quiz_attempts (quiz_id, created_at desc);

alter table public.quiz_attempts enable row level security;

-- Everybody reads their own attempts; an admin reads everyone's. Everybody
-- adds only as themself.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'quiz_attempts' and policyname = 'quiz_attempts_read'
  ) then
    create policy quiz_attempts_read on public.quiz_attempts
      for select to authenticated
      using (user_id = auth.uid() or public.is_admin());
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'quiz_attempts' and policyname = 'quiz_attempts_add'
  ) then
    create policy quiz_attempts_add on public.quiz_attempts
      for insert to authenticated
      with check (user_id = auth.uid());
  end if;
end $$;
