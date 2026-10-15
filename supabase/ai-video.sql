-- RETIRED 2026-10-15: the AI videos feature was taken out of the CRM (the panel,
-- the Make AI video button, the ai-video function source). These tables and
-- the deployed function were left in place; drop them by hand if wanted.

-- AI videos: one real recording per owner, then the CRM makes the weekly ads.
--
-- The owner records a short base clip once (talking to camera) and agrees in
-- writing that we may clone their voice and re-voice their own footage. From
-- then on a script card in the client chat has a "Make AI video" button: the
-- script is read in the owner's cloned voice (ElevenLabs), the base clip is
-- lip-synced to the new words (Sync.so), B-roll is filmed from the client's
-- photos or the trade (Higgsfield), and the cut with captions and an offer
-- card is rendered (Shotstack). The finished MP4 lands in the client's files
-- like any uploaded clip, so it goes out through the approval link and the
-- publish flow that already exist.
--
-- 1. The owner's voice and base clip, one row per client.
-- 2. The jobs, one row per video, advanced step by step by the ai-video
--    function (the browser polls it; a cron tick keeps jobs moving when
--    nobody has the page open).
--
-- Run this whole file in the SQL editor. Safe to re-run.

-- 1. Per-client setup: the base clip, the consent, the cloned voice.
create table if not exists client_ai_voice (
  client_id uuid primary key references clients(id) on delete cascade,
  base_video_path text,                 -- drive:<fileId> or a client-files path
  base_video_name text,
  ref_paths text[] not null default '{}', -- client-files paths of reference photos for B-roll
  voice_id text,                        -- ElevenLabs voice id
  voice_sample_path text,               -- the mp3 the voice was cloned from
  consent_name text,                    -- who agreed (the owner)
  consent_at timestamptz,
  consent_note text,
  status text not null default 'needs_clip'
    check (status in ('needs_clip', 'preparing', 'ready', 'error')),
  error text,
  setup_render_id text,                 -- Shotstack render pulling the voice sample off the clip
  prepared_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table client_ai_voice enable row level security;
grant select, insert, update, delete on client_ai_voice to anon, authenticated;

-- 2. The jobs.
create table if not exists ai_videos (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  title text,
  script text not null,                 -- the whole script card
  spoken text not null,                 -- the lines the owner says
  on_screen text,                       -- the "On screen text" line, for the offer card
  status text not null default 'queued'
    check (status in ('queued', 'generating', 'rendering', 'done', 'failed')),
  step text,                            -- what is happening now, in words
  error text,
  failed_from text,                     -- the status a failed job was in, so Retry resumes there
  note text,                            -- e.g. "No B-roll: Higgsfield keys not set"
  duration_seconds numeric,
  offer_start numeric,                  -- when the OFFER line begins, for the card
  audio_path text,
  sync_id text,
  owner_url text,
  owner_path text,
  broll jsonb not null default '[]',    -- [{request_id, status_url, prompt, kind, status, url, path}]
  render_id text,
  timeline jsonb,                       -- what was sent to the renderer
  video_path text,                      -- the finished MP4, a client-files path
  poster_path text,
  approval_token uuid,
  locked_until timestamptz,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_videos_client_idx on ai_videos (client_id, created_at desc);
create index if not exists ai_videos_active_idx on ai_videos (updated_at)
  where status in ('queued', 'generating', 'rendering');

alter table ai_videos enable row level security;
grant select, insert, update, delete on ai_videos to anon, authenticated;

-- Policies, created only when missing (no drop, so the file re-runs cleanly
-- and never trips a "destructive statement" check). Same open-while-login-off
-- pattern as the other tables.
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'client_ai_voice' and policyname = 'anon_open_while_login_off') then
    execute 'create policy anon_open_while_login_off on client_ai_voice for all to anon using (true) with check (true)';
  end if;
  if not exists (select 1 from pg_policies where tablename = 'client_ai_voice' and policyname = 'staff_all') then
    execute 'create policy staff_all on client_ai_voice for all to authenticated using (true) with check (true)';
  end if;
  if not exists (select 1 from pg_policies where tablename = 'ai_videos' and policyname = 'anon_open_while_login_off') then
    execute 'create policy anon_open_while_login_off on ai_videos for all to anon using (true) with check (true)';
  end if;
  if not exists (select 1 from pg_policies where tablename = 'ai_videos' and policyname = 'staff_all') then
    execute 'create policy staff_all on ai_videos for all to authenticated using (true) with check (true)';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- SCHEDULE: a tick every minute moves jobs along when nobody has the client
-- page open (the page polls the same function while it is open). The
-- function is deployed with verify_jwt = true and the gateway accepts the
-- project's anon key; a tick does nothing a stranger could profit from.
-- ---------------------------------------------------------------------------
-- select cron.unschedule('ai-video-tick')
--   where exists (select 1 from cron.job where jobname = 'ai-video-tick');
-- select cron.schedule(
--   'ai-video-tick',
--   '* * * * *',
--   $$
--   select net.http_post(
--     url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/ai-video',
--     headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY>","apikey":"<ANON_KEY>"}'::jsonb,
--     body    := '{"action":"tick"}'::jsonb,
--     timeout_milliseconds := 60000
--   );
--   $$
-- );
