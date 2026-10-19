-- The Video Script Studio: a client's own page for video scripts.
--
-- Clients open /scripts/<token> (the same private token as their dashboard,
-- clients.dashboard_token) and get scripts to read into a phone, written
-- from everything the CRM knows about them. The page talks only to the
-- script-studio Edge Function, which checks the token, gathers the facts
-- with the service role and holds the Anthropic key; the browser never
-- reads these tables itself. The CRM (anon, no login) reads video_scripts
-- for the card on the client page, like every other table here.
--
-- Run in the SQL editor. Safe to re-run. Already applied to the project.

-- How the owner talks: { goes_by, person ('i' | 'we' | ''), tone
-- ('straight' | 'friendly' | 'funny'), avoid, sign_off, notes }. Filled in
-- by the client on their page ("How I talk"), read into every brief.
alter table clients add column if not exists voice_profile jsonb;

create table if not exists video_scripts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  -- The script this one is a one-tap change of (Shorter, Punchier...), so
  -- versions hang together.
  parent_id uuid references video_scripts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 'client' from their page, 'agency' when the CRM wrote one for them.
  made_by text not null default 'client',
  -- The taps: { topic, length, speaker, setting, tone, extra, idea }.
  ask jsonb not null default '{}'::jsonb,
  -- { title, why_now, seconds, hook, lines: [{ say, show }], on_screen,
  --   caption, cta, film_it } (supabase/functions/_shared/scriptStudio.js).
  script jsonb not null,
  status text not null default 'new' check (status in ('new', 'saved', 'filmed', 'archived')),
  filmed_at timestamptz,
  -- Token usage of the call that wrote it, for the agency's eyes.
  usage jsonb
);

create index if not exists video_scripts_client_idx on video_scripts (client_id, created_at desc);

-- Same posture as the rest of this project (see fix-rls.sql).
alter table video_scripts disable row level security;

-- The link preview for /scripts/<token> shows the business name, through
-- the same lookup the dashboard and report links use.
create or replace function client_link_name(p_kind text, p_token text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_kind in ('dashboard', 'scripts', 'videos') then (select name from clients where dashboard_token = p_token and archived = false and length(p_token) >= 20 limit 1)
    when p_kind = 'report' then (select c.name from weekly_reports w join clients c on c.id = w.client_id where w.token = p_token and length(p_token) >= 20 limit 1)
    else null
  end;
$$;
revoke all on function client_link_name(text, text) from public;
grant execute on function client_link_name(text, text) to anon, authenticated;
