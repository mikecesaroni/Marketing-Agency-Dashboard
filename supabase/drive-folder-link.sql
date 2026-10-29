-- The photos folder, the other way round. Applied 2026-10-29; safe to run twice.
--
-- The onboarding message used to ask the client to make a Google Drive folder,
-- share it with our service account and reply with the link: three things to
-- get wrong. Now WE make the folder, share it with the client, and link it on
-- the client page under Files. The message hands them the link ("I made one
-- folder in Google Drive. Please add in your best job photos/videos..."), and
-- so does the photos step of their own form, from this function. The form's
-- old instructions (make a folder, share it with us, paste the link) stay as
-- the fallback for a client nobody has made a folder for.
--
-- onboarding_link_load() gains drive_folder_url: the full share link when a
-- folder is linked, else absent. The folder is the client's own, so the token
-- that already unlocks their EIN and address can carry it.

create or replace function onboarding_link_load(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_result jsonb;
begin
  v_client_id := onboarding_link_client(p_token);

  select jsonb_build_object(
    'client_name', c.name,
    'intake', coalesce(to_jsonb(i.*) - 'id' - 'client_id', '{}'::jsonb),
    'ghl', coalesce(to_jsonb(g.*) - 'id' - 'client_id', '{}'::jsonb),
    'intake_submitted_at', l.intake_submitted_at,
    'ghl_submitted_at', l.ghl_submitted_at,
    'drive_connected', c.drive_folder_id is not null,
    -- The folder is theirs: we make it, share it with them and link it here,
    -- and the form hands them the link so their photos land in the right place.
    'drive_folder_url', case when c.drive_folder_id is not null
      then 'https://drive.google.com/drive/folders/' || c.drive_folder_id || '?usp=sharing' end
  )
  into v_result
  from clients c
  join onboarding_links l on l.client_id = c.id and l.token = p_token
  left join onboarding_intake i on i.client_id = c.id
  left join ghl_setup g on g.client_id = c.id
  where c.id = v_client_id;

  return v_result;
end;
$$;
