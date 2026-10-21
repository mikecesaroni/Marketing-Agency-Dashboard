-- The team brief and the Slack channel (docs/weekly-status.md).
--
-- Applied as the migration `team_brief` on 2026-10-21. Three things:
--
--   1. team_digests: a log of every brief, alert post and test, so the CRM
--      can say "sent this morning to Slack" and show what it said.
--   2. team_alerts: every flag the channel has been told about, keyed per
--      client per thing, with when it cleared. The alerts job posts only
--      keys that are not open here, so the channel hears each thing once.
--   3. The Slack incoming webhook URL, in the vault. The URL is a secret:
--      anyone holding it can post to the channel. So it is never in
--      app_settings (readable by every signed-in person); an admin sets it
--      through set_slack_webhook(), the Edge Function reads it through
--      slack_webhook() with the service key, and the CRM only ever learns
--      whether one is set (slack_connected()).

create table if not exists public.team_digests (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  kind text not null check (kind in ('brief', 'alerts', 'test')),
  status text not null check (status in ('sent', 'ready', 'failed', 'skipped')),
  reason text,
  slack_status text,
  email_status text,
  recipients text[] not null default '{}',
  subject text,
  model jsonb,
  created_at timestamptz not null default now()
);
create index if not exists team_digests_day_idx on public.team_digests (day desc, created_at desc);
alter table public.team_digests enable row level security;
drop policy if exists team_digests_read on public.team_digests;
create policy team_digests_read on public.team_digests for select to authenticated using (true);

create table if not exists public.team_alerts (
  key text primary key,
  client_id uuid references public.clients(id) on delete cascade,
  client_name text,
  kind text not null,
  label text,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  posted_at timestamptz,
  cleared_at timestamptz
);
create index if not exists team_alerts_open_idx on public.team_alerts (cleared_at) where cleared_at is null;
alter table public.team_alerts enable row level security;
drop policy if exists team_alerts_read on public.team_alerts;
create policy team_alerts_read on public.team_alerts for select to authenticated using (true);

-- The webhook, read only by the service key (the Edge Function).
create or replace function public.slack_webhook() returns text
language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'slack_webhook_url' limit 1
$$;
revoke all on function public.slack_webhook() from public;
revoke all on function public.slack_webhook() from anon;
revoke all on function public.slack_webhook() from authenticated;
grant execute on function public.slack_webhook() to service_role;

-- Set, replace or clear it. Admins only.
create or replace function public.set_slack_webhook(url text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  sid uuid;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can connect Slack.';
  end if;
  select id into sid from vault.secrets where name = 'slack_webhook_url';
  if url is null or btrim(url) = '' then
    if sid is not null then delete from vault.secrets where id = sid; end if;
    return false;
  end if;
  if btrim(url) not like 'https://hooks.slack.com/%' then
    raise exception 'That is not a Slack incoming webhook URL. It starts with https://hooks.slack.com/';
  end if;
  if sid is null then
    perform vault.create_secret(btrim(url), 'slack_webhook_url', 'The team Slack channel: incoming webhook for the brief and the alerts');
  else
    perform vault.update_secret(sid, btrim(url));
  end if;
  return true;
end
$$;
revoke all on function public.set_slack_webhook(text) from public;
grant execute on function public.set_slack_webhook(text) to authenticated;

-- Whether one is set, for the CRM. Never the URL.
create or replace function public.slack_connected() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from vault.secrets where name = 'slack_webhook_url')
$$;
revoke all on function public.slack_connected() from public;
grant execute on function public.slack_connected() to authenticated;
grant execute on function public.slack_connected() to service_role;

-- The schedule (pg_cron, already on this project):
--   team-morning-brief  weekdays 11:00 UTC (7am Eastern)   {"action":"brief"}
--   team-alerts         every 15 minutes                   {"action":"alerts"}
-- Both call the team-digest function the way weekly-client-reports calls
-- weekly-report: net.http_post with the project's anon key. The alerts
-- job posts nothing between 9pm and 7am Eastern (the function skips), and
-- nothing at all unless something is new.
