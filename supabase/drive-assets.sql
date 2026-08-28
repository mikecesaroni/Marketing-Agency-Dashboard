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
