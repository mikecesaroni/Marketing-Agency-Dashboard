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

-- BACKFILL ---------------------------------------------------------------
-- The trigger only fires on clients created after it exists, so anyone
-- already in the CRM — including everyone still onboarding — would never get
-- these. This adds whichever of the three they're missing.
--
-- Matches on title, so a deliverable you already created by hand isn't
-- duplicated, and one you finished and deleted doesn't come back... it does,
-- actually — deleting one and re-running this restores it. Re-run only when
-- you've added new clients.

insert into deliverables (client_id, title, type, status)
select c.id, v.title, v.type, 'todo'
from clients c
cross join (values
  ('Make video ad', 'creative'),
  ('Make 4 static ads', 'creative'),
  ('Go live with first Meta Campaign', 'campaign')
) as v(title, type)
where c.status <> 'churned'
  and not exists (
    select 1 from deliverables d
    where d.client_id = c.id and d.title = v.title
  );
