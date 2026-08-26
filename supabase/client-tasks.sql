-- Replaces the fixed 14-item onboarding checklist with an open task list.
--
-- Nothing about the 181 existing rows changes — they stay exactly as they
-- are, checked or not, as real history for every client already onboarded.
-- What stops is the trigger that stamped the same 14 items onto every NEW
-- client regardless of what onboarding for them actually looks like. Tasks
-- from here on are added by hand or pulled out of that client's chat.

drop trigger if exists on_client_created on clients;
drop function if exists create_onboarding_tasks();

alter table onboarding_tasks rename to client_tasks;

-- 'chat' rows came out of a client's chat history (Fireflies notes pasted in,
-- "remember this" asides) rather than being typed in by hand — worth knowing
-- at a glance, since an extracted task is a guess and a manual one is not.
alter table client_tasks add column if not exists source text not null default 'manual'
  check (source in ('manual', 'chat'));
-- Why the task exists — which meeting, who asked, the line it came from.
-- Free text, not shown unless there's something there.
alter table client_tasks add column if not exists notes text;
alter table client_tasks add column if not exists created_at timestamptz not null default now();
