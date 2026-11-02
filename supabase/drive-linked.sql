-- CRM update when a Drive folder is linked. Applied 2026-11-02; safe to run twice.
--
-- "Send CRM update when Google Drive is linked." The channel hears the moment
-- a client's photo folder is linked from the client page, the Content board
-- or the Ad Studio picker, by whoever is at the keyboard. The row carries
-- when and by whom. drive_linked_at is stamped by a trigger whenever
-- drive_folder_id changes to a new folder, so saving the same link again is
-- not news; drive_linked_by is the CRM's "You" name, written with the save.
-- The team-digest function posts once per client and folder
-- (drive:<client>:<folder>): told by the page the moment it saves, and swept
-- by the quarter-hour alert run over the last three days, so a page that
-- failed to tell it still gets its line.
--
-- The client's own form no longer asks for the folder ("take that out of the
-- onboarding form, I'm doing it myself from now on and I'll paste the link in
-- the onboarding message"), so the token-gated save from supabase/drive-assets.sql
-- is dropped here: nothing calls it, and a write path open to anyone holding a
-- link token is better gone.

alter table clients add column if not exists drive_linked_at timestamptz;
alter table clients add column if not exists drive_linked_by text;

create or replace function stamp_drive_linked()
returns trigger
language plpgsql
as $$
begin
  if new.drive_folder_id is not null and new.drive_folder_id is distinct from old.drive_folder_id then
    new.drive_linked_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists clients_stamp_drive_linked on clients;
create trigger clients_stamp_drive_linked
  before update of drive_folder_id on clients
  for each row execute function stamp_drive_linked();

drop function if exists onboarding_link_save_drive(text, text);

-- onboarding_link_load() still returns drive_connected and drive_folder_url
-- (supabase/drive-folder-link.sql); the form no longer reads them.
