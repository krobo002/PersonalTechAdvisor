-- supabase/migrations/0001_init.sql
create extension if not exists "pgcrypto";

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  stack_tags jsonb not null default '[]'::jsonb,
  goal_tags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists recommendations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  source text not null,
  title text not null,
  url text not null,
  category text not null check (category in ('maintain', 'grow')),
  score numeric not null,
  blurb text not null,
  learning_action text not null default '',
  learning_time_estimate text not null default '',
  status text not null default 'new' check (status in ('new', 'in-progress', 'learned', 'skipped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, source, url)
);

create table if not exists digest_log (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  sent_at timestamptz not null default now(),
  recommendation_ids jsonb not null default '[]'::jsonb
);
