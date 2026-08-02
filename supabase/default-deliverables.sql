-- Give every new client the standard launch deliverables automatically,
-- the same way onboarding tasks are created.
--
-- Run this in the Supabase SQL Editor. Requires the deliverables table, so
-- run supabase/deliverables.sql first if you haven't. Safe to run twice.

create or replace function create_default_deliverables()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into deliverables (client_id, title, type, status)
  values
    (new.id, 'Make video ad', 'creative', 'todo'),
    (new.id, 'Make 4 static ads', 'creative', 'todo'),
    (new.id, 'Go live with first Meta Campaign', 'campaign', 'todo');
  return new;
end;
$$;

-- Named apart from on_client_created, which builds the onboarding checklist —
-- a table can carry both triggers, and dropping the wrong one is easy to do.
drop trigger if exists on_client_created_deliverables on clients;

create trigger on_client_created_deliverables
  after insert on clients
  for each row
  execute function create_default_deliverables();

-- Due dates are deliberately left empty. Inventing deadlines here would mark
-- these red on the dashboard the moment they passed, for dates nobody chose.
-- Set them per client from the Deliverables tab.
