-- ── Migration 002: projects + issue status + scan diff ──────────────────────
-- Run this in your Supabase SQL editor after the initial migration

-- Projects table (named sites, group scans together)
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text not null,
  created_at timestamptz not null default now(),
  last_scanned_at timestamptz,
  description text
);

-- Link scans to projects
alter table scans
  add column if not exists project_id uuid references projects(id) on delete set null,
  add column if not exists label text; -- optional human label e.g. "pre-deploy", "v2.3 release"

-- Issue status tracking
alter table issues
  add column if not exists status text not null default 'open', -- open | resolved | ignored
  add column if not exists resolved_in_scan_id uuid references scans(id) on delete set null,
  add column if not exists fingerprint text; -- hash of (type + url_target + location) for deduplication

-- Diff summary stored on report
alter table reports
  add column if not exists diff jsonb; -- { new: [], resolved: [], regressed: [], unchanged: [] }

-- QA score on report (0-100)
alter table reports
  add column if not exists score_a integer,
  add column if not exists score_b integer;

-- Indexes
create index if not exists scans_project_id_idx on scans(project_id);
create index if not exists issues_fingerprint_idx on issues(fingerprint);
create index if not exists issues_status_idx on issues(status);
create index if not exists projects_created_at_idx on projects(created_at desc);
