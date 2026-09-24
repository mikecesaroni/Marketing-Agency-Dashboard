-- The people tasks get assigned to.
--
-- Separate from profiles (who can LOG IN), because login is off and a person
-- can be on the team without a login. Tasks store assignee NAMES, not ids, so
-- a member renamed keeps their tasks by the rename function below, and a name
-- typed before the roster existed still matches. The roster is what the
-- pickers offer and what the sidebar counts by.

create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- What they do, shown under the name. Free text: "Media buyer", "VA".
  title text,
  -- Tailwind hue for the initials badge; from LIST_COLORS in src/lib/tasks.js.
  color text not null default 'slate',
  active boolean not null default true,
  sort_order integer not null default 500,
  created_at timestamptz not null default now()
);

create unique index if not exists team_members_name_idx on team_members (lower(name));

alter table team_members enable row level security;
drop policy if exists staff_all on team_members;
create policy staff_all on team_members for all to authenticated using (true) with check (true);
drop policy if exists anon_open_while_login_off on team_members;
create policy anon_open_while_login_off on team_members for all to anon using (true) with check (true);

-- Renaming a member renames them on every task, so the tasks follow the
-- person. Case-insensitive on the match, the same way the UI matches.
create or replace function rename_team_member(member_id uuid, new_name text) returns void as $$
declare
  old_name text;
begin
  select name into old_name from team_members where id = member_id;
  if old_name is null then return; end if;
  update team_members set name = new_name where id = member_id;
  update tasks
    set assignees = array(
      select case when lower(a) = lower(old_name) then new_name else a end
      from unnest(assignees) as a
    )
    where exists (select 1 from unnest(assignees) as a where lower(a) = lower(old_name));
end;
$$ language plpgsql;
