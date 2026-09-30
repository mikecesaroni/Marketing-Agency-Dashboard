-- Keyword plans built by the Google Ads keyword builder (Reports, Google
-- Ads, a client, "Keyword plan"). One row per generation: the seeds and
-- places asked for, Google's raw ideas, and the choices made on the page.
--
-- ideas: [{ text, volume, competition, competitionIndex, lowBid, highBid,
--           avgCpc, monthly: [{y, m, v}], concepts, fromUrl }]
-- locations: [{ name, id (geoTargetConstants/...), canonical, type }]
-- choices: { excluded: [text], match: { text: 'exact'|'phrase' }, notes }
--           written by the browser as the plan is edited.
create table if not exists google_keyword_plans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  generated_at timestamptz not null default now(),
  seeds text[] not null default '{}',
  locations jsonb not null default '[]',
  url text,
  ideas jsonb not null default '[]',
  idea_count int not null default 0,
  choices jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
create index if not exists google_keyword_plans_client_idx on google_keyword_plans (client_id, generated_at desc);

-- Same posture as the other Google tables while login is off.
alter table google_keyword_plans enable row level security;
drop policy if exists anon_open_while_login_off on google_keyword_plans;
create policy anon_open_while_login_off on google_keyword_plans for all to anon using (true) with check (true);
grant select, insert, update, delete on google_keyword_plans to anon, authenticated;
