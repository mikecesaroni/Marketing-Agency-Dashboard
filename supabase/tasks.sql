-- The team task board. Modelled on ClickUp, cut down to what a five-person
-- agency uses.
--
-- ClickUp's hierarchy is Workspace > Space > Folder > List > Task > Subtask.
-- Here the Workspace is the CRM, every client is a List already (the roster
-- is the folder structure), and task_lists holds the internal lists that are
-- not about one client: "Agency", "Content", "Hiring". A task sits in a
-- client OR a list OR neither (the inbox). Statuses are one fixed set rather
-- than per-list, because per-list statuses are the thing every ClickUp
-- workspace regrets by month three.
--
-- What is kept from ClickUp: status, priority (urgent/high/normal/low), several
-- assignees, start and due dates, tags, subtasks (one level, via parent_id),
-- a checklist inside a task, comments, and the "Me mode" filter. What is left
-- out on purpose: time tracking, dependencies, recurring tasks, custom fields,
-- Gantt. They can be added; none has been asked for.
--
-- client_tasks (the per-client onboarding checklist) is untouched. It is a
-- checklist that belongs to a client's onboarding, read by the client page
-- and by the chat's task extraction; this is the team's own work list.

create table if not exists task_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Tailwind hue name, picked from a fixed set in the UI (src/lib/tasks.js).
  color text not null default 'slate',
  sort_order integer not null default 500,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  -- One fixed set, mirrored in src/lib/tasks.js TASK_STATUSES.
  status text not null default 'todo'
    check (status in ('todo', 'in_progress', 'review', 'done')),
  -- ClickUp's four flags, plus "none", which is what most tasks are.
  priority text not null default 'normal'
    check (priority in ('urgent', 'high', 'normal', 'low')),
  -- Exactly one of these, or neither for the inbox.
  client_id uuid references clients(id) on delete cascade,
  list_id uuid references task_lists(id) on delete set null,
  -- A subtask points at its parent. One level: a subtask cannot have subtasks,
  -- enforced in the UI rather than here so a deeper import is not refused.
  parent_id uuid references tasks(id) on delete cascade,
  -- Names, not user ids: login is off and the team is five people. The UI
  -- offers the names it has seen before.
  assignees text[] not null default '{}',
  tags text[] not null default '{}',
  start_date date,
  due_date date,
  -- [{id, text, done}] -- a checklist inside a task, for the steps that are
  -- not worth a subtask each.
  checklist jsonb not null default '[]'::jsonb,
  sort_order integer not null default 500,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists tasks_client_idx on tasks (client_id);
create index if not exists tasks_list_idx on tasks (list_id);
create index if not exists tasks_parent_idx on tasks (parent_id);
create index if not exists tasks_status_idx on tasks (status);
create index if not exists tasks_due_idx on tasks (due_date);

create table if not exists task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  author text,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists task_comments_task_idx on task_comments (task_id);

-- updated_at and completed_at are kept by the database, not remembered at
-- every call site. Marking done stamps completed_at; reopening clears it.
create or replace function tasks_touch() returns trigger as $$
begin
  new.updated_at := now();
  if new.status = 'done' and (old.status is distinct from 'done') then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists tasks_touch on tasks;
create trigger tasks_touch before update on tasks
  for each row execute function tasks_touch();

-- Same access shape as every other table: staff see everything, and while
-- login is off the anon key does too (see supabase/reopen-payments.sql).
alter table task_lists enable row level security;
alter table tasks enable row level security;
alter table task_comments enable row level security;

drop policy if exists staff_all on task_lists;
create policy staff_all on task_lists for all to authenticated using (true) with check (true);
drop policy if exists anon_open_while_login_off on task_lists;
create policy anon_open_while_login_off on task_lists for all to anon using (true) with check (true);

drop policy if exists staff_all on tasks;
create policy staff_all on tasks for all to authenticated using (true) with check (true);
drop policy if exists anon_open_while_login_off on tasks;
create policy anon_open_while_login_off on tasks for all to anon using (true) with check (true);

drop policy if exists staff_all on task_comments;
create policy staff_all on task_comments for all to authenticated using (true) with check (true);
drop policy if exists anon_open_while_login_off on task_comments;
create policy anon_open_while_login_off on task_comments for all to anon using (true) with check (true);

-- One list to start with, so the sidebar is not empty on first open.
insert into task_lists (name, color, sort_order)
select 'Agency', 'orange', 100
where not exists (select 1 from task_lists);
