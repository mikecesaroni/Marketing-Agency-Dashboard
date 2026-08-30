-- ---------------------------------------------------------------------------
-- AI SEARCH VISIBILITY SCANS
--
-- "Do the AI assistants name this business when someone asks who to call?"
--
-- The method is the one the AEO/GEO tools converged on: run a set of prompts a
-- real buyer would type, record which businesses get named and which sources
-- get cited, and score the client against whoever showed up instead of them.
--
-- Scans are deliberately NOT tied to a client. The highest-value use is
-- scanning a business that is not a client yet and taking the report to them,
-- so client_id is nullable and the business details are copied onto the scan.
-- ---------------------------------------------------------------------------

create table if not exists ai_scans (
  id uuid primary key default gen_random_uuid(),

  -- Null for a prospect. Set when the scan is run from a client's page, which
  -- is what lets a client's scans be tracked over time.
  client_id uuid references clients(id) on delete set null,

  business_name text not null,
  website_url text not null,
  -- The bare host, lowercased and stripped of www. Citation matching is a
  -- host comparison, and doing it against a full URL never matches.
  domain text not null,
  location text,
  industry text,

  -- 'building' while prompts are being written, 'running' while they are being
  -- asked, then 'complete' or 'failed'. The UI polls on this.
  status text not null default 'building'
    check (status in ('building', 'running', 'complete', 'failed')),
  error text,

  -- 0-100. Null until the scan completes.
  visibility_score integer,
  mention_rate numeric,
  citation_rate numeric,

  -- The technical audit: whether AI crawlers are even allowed in, and whether
  -- the site gives them anything structured to read.
  crawler_audit jsonb,
  -- Competitors, sentiment and the recommended fixes, written once at the end.
  findings jsonb,

  created_at timestamptz default now(),
  completed_at timestamptz
);

create index if not exists ai_scans_client_idx on ai_scans (client_id, created_at desc);
create index if not exists ai_scans_recent_idx on ai_scans (created_at desc);

-- One row per buyer prompt. Written as 'pending' up front so the scan can be
-- processed in batches across several invocations — a scan is 15 web searches
-- and will not finish inside one Edge Function timeout.
create table if not exists ai_scan_prompts (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references ai_scans(id) on delete cascade,

  prompt text not null,
  -- 'unbranded' (who's best), 'solution' (how do I fix X), 'comparison'
  -- (X vs Y). An unbranded miss is the one that costs real money.
  category text not null default 'unbranded',

  status text not null default 'pending'
    check (status in ('pending', 'done', 'failed')),

  -- Detection is deterministic rather than model-judged: a name match on the
  -- answer text, and a host match against the citations. A model asked "were
  -- they mentioned?" will sometimes say yes about a near-miss, and this is the
  -- number the whole report rests on.
  mentioned boolean,
  cited boolean,
  -- Roughly where in the answer the first mention lands, as a percentage.
  -- Being named last in a list of nine is not the same as being named first.
  position_pct integer,

  answer text,
  sources jsonb,
  error text,

  created_at timestamptz default now()
);

create index if not exists ai_scan_prompts_scan_idx on ai_scan_prompts (scan_id, status);

-- Same posture as the rest of this schema: the app is behind an auth wall and
-- the Edge Function writes with the service role.
alter table ai_scans disable row level security;
alter table ai_scan_prompts disable row level security;

-- ---------------------------------------------------------------------------
-- BEFORE / AFTER
--
-- Which earlier scan this one is measured against.
--
-- A re-scan only proves a fix worked if it asks the same questions. The prompt
-- set is written by a model, so left alone every scan asks something different
-- and a score moving 30 -> 45 could just as easily mean the second set was
-- easier. When this is set, the scan copied its prompts from that baseline
-- verbatim, which is what makes a before/after comparison a measurement rather
-- than a coincidence.
--
-- `start` fills it in on its own: the most recent complete scan for the same
-- client and the same domain. Null for a first scan, a prospect, or a client
-- whose website changed — all three write a fresh prompt set as before.
alter table ai_scans
  add column if not exists baseline_scan_id uuid references ai_scans(id) on delete set null;

create index if not exists ai_scans_baseline_idx on ai_scans (baseline_scan_id);
