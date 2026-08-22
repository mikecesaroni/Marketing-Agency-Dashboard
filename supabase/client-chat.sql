-- Per-client chat.
--
-- One ongoing conversation per client, so you can say "make me a new ad for
-- swap outs" and it already knows who the client is, what they sell, what their
-- budget is and what has already run. The client brief is rebuilt from live CRM
-- data on every request and sent as the system prompt, so the conversation
-- never carries a stale copy of the client's facts.
--
-- Only the turns are stored here. The brief is not, deliberately: storing it
-- would freeze the client's details at the moment the chat started.

create table if not exists client_chats (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_chats_client_idx on client_chats (client_id, updated_at desc);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references client_chats(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  -- Anthropic content blocks, kept whole rather than flattened to text.
  -- Tool calls, tool results and compaction blocks all have to be replayed
  -- back to the API exactly as they came out of it, and text alone loses them.
  content jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_chat_idx on chat_messages (chat_id, created_at);

-- Same posture as the rest of this project: the app talks to Supabase as anon
-- and there is no per-user auth yet, so RLS is off rather than open-to-all
-- policies that only look like security.
alter table client_chats disable row level security;
alter table chat_messages disable row level security;
