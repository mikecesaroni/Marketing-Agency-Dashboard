-- Team reminders: one line in the CRM updates Slack channel on a chosen day.
--
-- 2026-11-11: "Can you send a reminder in the CRM updates chat on November
-- 29 reminding us to send a new 2500 subscription payment link to Don Air
-- Co". The team-digest function has no "post this text" action, and a
-- reminder weeks out must not depend on a browser being open or a person
-- remembering to press anything, so a reminder is a one-shot pg_cron job:
--
--   select public.schedule_team_reminder(
--     'don-air-payment-link',                          -- the slug (the job is reminder:<slug>)
--     '2026-11-29 09:00 America/New_York'::timestamptz, -- when it posts
--     ':bell: Reminder: send Don Air Co a new $2,500 subscription payment link today.'
--   );
--
-- schedule_team_reminder() writes the row in team_reminders and makes the
-- job; at that minute the job calls post_team_reminder(), which posts the
-- line to the channel (the webhook read from the vault at that moment and
-- never stored in the job), records the post in team_digests as kind
-- 'note' (so the Weekly status page's log and the chat can see it went),
-- marks the row posted, and unschedules itself. A cron expression has no
-- year, so the job carries the day it was made for and posts only within a
-- day of it: should the unschedule ever fail, next year's firing removes
-- the job without posting. Both functions run only with the service key or
-- from SQL; the CRM reads team_reminders to show what is pending.
--
-- To cancel one before it posts:
--   select public.cancel_team_reminder('don-air-payment-link');

create table if not exists public.team_reminders (
  slug text primary key,
  fire_at timestamptz not null,
  message text not null,
  jobid bigint,
  status text not null default 'scheduled' check (status in ('scheduled', 'sent', 'failed', 'cancelled')),
  reason text,
  created_by text,
  created_at timestamptz not null default now(),
  posted_at timestamptz
);
alter table public.team_reminders enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'team_reminders' and policyname = 'team_reminders_read') then
    create policy team_reminders_read on public.team_reminders for select to authenticated using (true);
  end if;
end $$;

-- The job's command. Runs as the job's user (postgres), so the vault read,
-- the pg_net call and the unschedule all work without a key in the command.
create or replace function public.post_team_reminder(slug text, fire_at timestamptz, message text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  jname text := 'reminder:' || slug;
  hook text;
  rid bigint;
  posted boolean := false;
  why text;
  due boolean := now() between fire_at - interval '1 day' and fire_at + interval '1 day';
begin
  if due then
    hook := public.slack_webhook();
    if hook is null or btrim(hook) = '' then
      why := 'Slack is not connected';
    else
      begin
        select net.http_post(
          url := hook,
          headers := '{"Content-Type":"application/json"}'::jsonb,
          body := jsonb_build_object('text', message),
          timeout_milliseconds := 30000
        ) into rid;
        posted := true;
      exception when others then
        why := sqlerrm;
      end;
    end if;
    insert into public.team_digests (day, kind, status, reason, slack_status, subject, model)
    values (
      (now() at time zone 'America/New_York')::date,
      'note',
      case when posted then 'sent' else 'failed' end,
      why,
      case when posted then 'sent' when hook is null then 'off' else 'failed' end,
      'reminder:' || slug,
      jsonb_build_object('text', message, 'reminder', slug, 'fire_at', fire_at, 'request_id', rid)
    );
    update public.team_reminders r
      set status = case when posted then 'sent' else 'failed' end, reason = why, posted_at = now()
      where r.slug = post_team_reminder.slug;
  else
    why := 'not the day it was made for';
  end if;
  -- The job is done with, whatever happened above. Never let this undo the post.
  begin
    perform cron.unschedule(jname);
  exception when others then
    null;
  end;
  return jsonb_build_object('posted', posted, 'reason', why, 'request_id', rid);
end
$$;
revoke all on function public.post_team_reminder(text, timestamptz, text) from public;
revoke all on function public.post_team_reminder(text, timestamptz, text) from anon;
revoke all on function public.post_team_reminder(text, timestamptz, text) from authenticated;
grant execute on function public.post_team_reminder(text, timestamptz, text) to service_role;

-- Make (or remake) a reminder. Returns the job id.
create or replace function public.schedule_team_reminder(slug text, fire_at timestamptz, message text, created_by text default null) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  jname text := 'reminder:' || slug;
  sched text;
  cmd text;
  jid bigint;
begin
  if slug !~ '^[a-z0-9][a-z0-9-]{1,60}$' then
    raise exception 'The slug is lowercase letters, digits and dashes, like don-air-payment-link.';
  end if;
  if fire_at <= now() then
    raise exception 'That time has passed.';
  end if;
  if btrim(message) = '' then
    raise exception 'Nothing to say.';
  end if;
  -- pg_cron reads the schedule in UTC: minute, hour, day of month, month.
  sched := to_char(fire_at at time zone 'UTC', 'FMMI FMHH24 FMDD FMMM') || ' *';
  cmd := format('select public.post_team_reminder(%L, %L::timestamptz, %L)', slug, fire_at, btrim(message));
  if exists (select 1 from cron.job j where j.jobname = jname) then
    perform cron.unschedule(jname);
  end if;
  select cron.schedule(jname, sched, cmd) into jid;
  insert into public.team_reminders as r (slug, fire_at, message, jobid, status, reason, created_by, posted_at)
    values (slug, fire_at, btrim(message), jid, 'scheduled', null, created_by, null)
    on conflict on constraint team_reminders_pkey do update
      set fire_at = excluded.fire_at, message = excluded.message, jobid = excluded.jobid,
          status = 'scheduled', reason = null, created_by = coalesce(excluded.created_by, r.created_by),
          created_at = now(), posted_at = null;
  return jid;
end
$$;
revoke all on function public.schedule_team_reminder(text, timestamptz, text, text) from public;
revoke all on function public.schedule_team_reminder(text, timestamptz, text, text) from anon;
revoke all on function public.schedule_team_reminder(text, timestamptz, text, text) from authenticated;
grant execute on function public.schedule_team_reminder(text, timestamptz, text, text) to service_role;

-- Cancel one that has not posted yet.
create or replace function public.cancel_team_reminder(slug text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  jname text := 'reminder:' || slug;
  had boolean := false;
begin
  if exists (select 1 from cron.job j where j.jobname = jname) then
    perform cron.unschedule(jname);
    had := true;
  end if;
  update public.team_reminders r set status = 'cancelled', reason = 'cancelled'
    where r.slug = cancel_team_reminder.slug and r.status = 'scheduled';
  return had;
end
$$;
revoke all on function public.cancel_team_reminder(text) from public;
revoke all on function public.cancel_team_reminder(text) from anon;
revoke all on function public.cancel_team_reminder(text) from authenticated;
grant execute on function public.cancel_team_reminder(text) to service_role;
