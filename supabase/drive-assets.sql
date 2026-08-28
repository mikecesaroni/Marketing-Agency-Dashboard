-- ---------------------------------------------------------------------------
-- GOOGLE DRIVE FOLDER PER CLIENT
--
-- Lets the Ad Studio read a client's photos straight out of their Drive folder
-- instead of every image being uploaded into the CRM first. One folder id per
-- client is the whole schema change: the photos themselves are never copied
-- here, they are read on demand by the drive-assets Edge Function.
--
-- Only the folder ID is stored, not a share URL. A URL carries a `usp=sharing`
-- tail and sometimes a `/u/1/` account segment, and pasting one of those into
-- a Drive API query silently returns an empty folder rather than an error. The
-- app parses the id out of whatever gets pasted before saving it.
-- ---------------------------------------------------------------------------
alter table clients add column if not exists drive_folder_id text;

-- Safe to re-run. Existing clients get NULL, which the Studio reads as "no
-- folder linked" and falls back to the uploaded-files picker.

-- ---------------------------------------------------------------------------
-- LETTING THE CLIENT CONNECT THEIR OWN FOLDER
--
-- Run supabase/ghl-setup.sql first: this uses onboarding_link_client() so the
-- token check lives in exactly one place.
--
-- Asking a client to reply with the folder link is a step that gets forgotten,
-- and then a folder sits shared with nobody noticing. The onboarding page
-- collects it instead, through the same token-gated door as the rest of that
-- page -- the client never touches a table directly.
--
-- The URL is parsed here rather than in the browser, for the same reason the
-- app parses it: storing a whole share URL as the id is accepted by the Drive
-- API without complaint and returns an empty folder, which reads as "no photos"
-- rather than "wrong value".
-- ---------------------------------------------------------------------------
create or replace function onboarding_link_save_drive(p_token text, p_url text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_folder text;
  v_raw text := trim(coalesce(p_url, ''));
begin
  v_client_id := onboarding_link_client(p_token);

  v_folder := (regexp_match(v_raw, '/folders/([A-Za-z0-9_-]+)'))[1];
  if v_folder is null then
    v_folder := (regexp_match(v_raw, '[?&]id=([A-Za-z0-9_-]+)'))[1];
  end if;
  -- A bare id pasted on its own. Drive ids are long; anything short is a paste
  -- that went wrong and should be rejected rather than stored.
  if v_folder is null and v_raw ~ '^[A-Za-z0-9_-]{16,}$' then
    v_folder := v_raw;
  end if;

  if v_folder is null then
    raise exception 'not_a_drive_folder_link';
  end if;

  update clients set drive_folder_id = v_folder where id = v_client_id;
  return v_folder;
end;
$$;

grant execute on function onboarding_link_save_drive(text, text) to anon, authenticated;

-- onboarding_link_load() also gained a `drive_connected` boolean so a client
-- coming back to a half-finished form is not asked for the folder twice. The
-- current definition lives in supabase/ghl-setup.sql.
