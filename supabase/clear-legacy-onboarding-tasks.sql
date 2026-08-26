-- Removes the old fixed onboarding checklist rows that client-tasks.sql left
-- in place as "history" — turns out that was the wrong call, they're still
-- cluttering every client's task list.
--
-- Rather than hardcoding the checklist's item names (the live version has at
-- least one item — "Payment / billing set up" — that isn't in this repo's
-- copy of the seed script, so a hardcoded list would miss it), this finds
-- them by the one thing that's actually true of every seeded item and false
-- of a real task: it repeats across most clients. A task someone types in by
-- hand belongs to one client.

-- STEP 1 — look before deleting. Run this first.
select task_name, count(*) as clients, min(created_at) as first_seen
from client_tasks
where source = 'manual'
group by task_name
having count(*) >= 5
order by clients desc;

-- Check the output: it should be exactly the old checklist items, each
-- appearing once per client (roughly 13 times, one per client in the CRM).
-- If anything in that list is actually a real task you typed by hand for
-- every client on purpose, stop here and tell me — the DELETE below removes
-- every row matching STEP 1's filter.

-- STEP 2 — only after checking STEP 1's output looks right.
delete from client_tasks
where source = 'manual'
  and task_name in (
    select task_name
    from client_tasks
    where source = 'manual'
    group by task_name
    having count(*) >= 5
  );
