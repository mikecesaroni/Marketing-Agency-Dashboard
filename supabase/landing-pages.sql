-- Landing pages per client: where the ads send people. One row per page,
-- so the team has one place to find, copy and check them instead of
-- digging through Slack. Shown on the client page (Landing pages panel),
-- on the Content tab (Landing pages door), in the Meta publish flow (pick a
-- saved page) and in the client chat brief.
--
-- purpose: meta | google | booking | site | other
create table if not exists landing_pages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  url text not null,
  label text not null default '',
  purpose text not null default 'other',
  notes text not null default '',
  added_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists landing_pages_client_idx on landing_pages (client_id, created_at);

-- Same posture as the other tables while login is off.
alter table landing_pages enable row level security;
drop policy if exists anon_open_while_login_off on landing_pages;
create policy anon_open_while_login_off on landing_pages for all to anon using (true) with check (true);
grant select, insert, update, delete on landing_pages to anon, authenticated;
