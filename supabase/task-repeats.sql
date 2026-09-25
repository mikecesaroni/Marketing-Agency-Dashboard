-- Repeating tasks: "every week, for Kyle".
--
-- A task with `repeat` set spawns the next one the moment it is marked done,
-- in the database rather than the screen, so it happens whichever way it was
-- ticked off (the drawer, a drag to Done, anything). The done one stays done
-- with its date; the new one is a copy (title, notes, people, client, list,
-- priority, tags, checklist unticked) due one period on. `repeat_of` points
-- every copy at the original so a chain can be found.
--
-- The next due date is always in the future: a weekly task finished three
-- weeks late lands next week, not two weeks ago.

alter table tasks add column if not exists repeat text
  check (repeat in ('daily', 'weekly', 'biweekly', 'monthly'));
alter table tasks add column if not exists repeat_of uuid references tasks(id) on delete set null;

create or replace function tasks_spawn_repeat() returns trigger as $$
declare
  step interval;
  base date;
  next_due date;
  next_start date;
  guard int := 0;
begin
  if new.repeat is null then return new; end if;
  if new.status <> 'done' or old.status = 'done' then return new; end if;

  step := case new.repeat
    when 'daily' then interval '1 day'
    when 'weekly' then interval '7 days'
    when 'biweekly' then interval '14 days'
    when 'monthly' then interval '1 month'
  end;

  base := coalesce(new.due_date, current_date);
  next_due := base + step;
  while next_due <= current_date and guard < 400 loop
    next_due := next_due + step;
    guard := guard + 1;
  end loop;
  next_start := case when new.start_date is not null then new.start_date + (next_due - base) else null end;

  insert into tasks (title, description, status, priority, client_id, list_id, parent_id, assignees, tags,
                     start_date, due_date, checklist, sort_order, created_by, repeat, repeat_of)
  values (new.title, new.description, 'todo', new.priority, new.client_id, new.list_id, new.parent_id,
          new.assignees, new.tags, next_start, next_due,
          coalesce((select jsonb_agg(item || '{"done": false}'::jsonb) from jsonb_array_elements(new.checklist) item), '[]'::jsonb),
          new.sort_order, new.created_by, new.repeat, coalesce(new.repeat_of, new.id));
  return new;
end;
$$ language plpgsql;

drop trigger if exists tasks_spawn_repeat on tasks;
create trigger tasks_spawn_repeat after update of status on tasks
  for each row execute function tasks_spawn_repeat();
