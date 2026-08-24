-- ---------------------------------------------------------------------------
-- SOP ATTACHMENTS
--
-- PDFs and documents that belong to a procedure: a signed template, a printed
-- checklist, a platform's own guide. The SOP text stays the readable version;
-- these are the artefacts it refers to.
--
-- Files live in the existing 'client-files' bucket under a sops/ prefix rather
-- than in a bucket of their own, so there is one set of storage policies to
-- keep right. That bucket is PUBLIC: anyone holding a file's URL can open it
-- without logging in. The URLs are long and random so they are not guessable,
-- but they are not protected either. See the note at the end of
-- storage-bucket.sql before attaching anything confidential.
-- ---------------------------------------------------------------------------
create table if not exists sop_files (
  id uuid primary key default gen_random_uuid(),
  sop_id uuid not null references sops(id) on delete cascade,
  file_name text not null,
  file_type text not null default 'application/pdf',
  file_size integer not null,
  storage_path text not null,
  uploaded_at timestamptz not null default now()
);

create index if not exists sop_files_sop_idx on sop_files (sop_id, uploaded_at desc);

alter table sop_files disable row level security;
