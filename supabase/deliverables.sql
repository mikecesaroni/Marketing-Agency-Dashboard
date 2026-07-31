-- Deliverables table — run this whole file once in the Supabase SQL Editor.
-- Tracks every piece of work owed to a client (creatives, reports, campaigns, etc.)
-- so the Deliverables tab can show everything across all clients in one place.

create table if not exists deliverables (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  title text not null,
  type text not null default 'other'
    check (type in ('creative', 'campaign', 'report', 'landing page', 'other')),
  status text not null default 'todo'
    check (status in ('todo', 'in progress', 'review', 'done')),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high')),
  due_date date,
  completed_date date,
  notes text,
  created_at timestamp not null default current_timestamp
);

create index if not exists deliverables_client_id_idx on deliverables (client_id);
create index if not exists deliverables_due_date_idx on deliverables (due_date);

-- The app runs without login, same as the other tables, so RLS stays off here too.
alter table deliverables disable row level security;
