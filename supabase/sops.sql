-- Standard operating procedures, written as plain text and rendered by the app.
-- Run this in the Supabase SQL Editor. Safe to run twice.

create table if not exists sops (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text,
  content text not null default '',
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sops_category_idx on sops (category);

alter table sops disable row level security;
