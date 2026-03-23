-- Run this in your Supabase SQL editor

create extension if not exists "pgcrypto";

create table if not exists scans (
  id uuid primary key default gen_random_uuid(),
  url_a text not null,
  url_b text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  error text
);

create table if not exists issues (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references scans(id) on delete cascade,
  url_target text,
  type text,
  severity text,
  location text,
  description text,
  suggested_fix text,
  meta jsonb,
  external boolean default false
);

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references scans(id) on delete cascade,
  screenshot_a text,
  screenshot_b text,
  seo_a jsonb,
  seo_b jsonb,
  html_report_path text,
  json_report jsonb
);

-- Indexes
create index if not exists issues_scan_id_idx on issues(scan_id);
create index if not exists reports_scan_id_idx on reports(scan_id);
create index if not exists scans_created_at_idx on scans(created_at desc);

-- Storage bucket (run manually in Supabase Storage UI or via this)
insert into storage.buckets (id, name, public)
values ('screenshots', 'screenshots', true)
on conflict do nothing;
