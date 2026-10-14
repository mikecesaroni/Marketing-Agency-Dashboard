-- The help chat: the sticky button at the bottom right of every CRM page.
--
-- One chat per browser (the id is kept in localStorage), every turn stored
-- as the content blocks the API saw, tool calls and results included, so a
-- conversation can carry on after a reload and the API never sees a tool
-- call without its result. Nothing here is per client: the chat can act on
-- any page, and the page says which client it is about.
--
-- Run this whole file in the SQL editor. Safe to re-run.

create table if not exists help_chats (
  id uuid primary key default gen_random_uuid(),
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists help_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references help_chats(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists help_messages_chat_idx on help_messages (chat_id, created_at);

alter table help_chats enable row level security;
alter table help_messages enable row level security;
grant select, insert, update, delete on help_chats, help_messages to anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'help_chats' and policyname = 'anon_open_while_login_off') then
    execute 'create policy anon_open_while_login_off on help_chats for all to anon using (true) with check (true)';
  end if;
  if not exists (select 1 from pg_policies where tablename = 'help_chats' and policyname = 'staff_all') then
    execute 'create policy staff_all on help_chats for all to authenticated using (true) with check (true)';
  end if;
  if not exists (select 1 from pg_policies where tablename = 'help_messages' and policyname = 'anon_open_while_login_off') then
    execute 'create policy anon_open_while_login_off on help_messages for all to anon using (true) with check (true)';
  end if;
  if not exists (select 1 from pg_policies where tablename = 'help_messages' and policyname = 'staff_all') then
    execute 'create policy staff_all on help_messages for all to authenticated using (true) with check (true)';
  end if;
end $$;
