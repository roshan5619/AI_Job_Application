-- AI Execution Agent — initial schema
-- Every user-owned table carries user_id and is protected by RLS so a user
-- can only ever read/write their own rows. Server-side workflows use the
-- service-role key (which bypasses RLS) and must scope by user_id explicitly.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- candidate_profiles: structured resume per user
-- ---------------------------------------------------------------------------
create table if not exists candidate_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  profile jsonb not null,                 -- CandidateProfile (see src/lib/types.ts)
  base_resume_file_id uuid,               -- -> resume_files.id (original upload)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_candidate_profiles_user on candidate_profiles (user_id);

-- ---------------------------------------------------------------------------
-- resume_files: Storage references (originals + generated tailored PDFs)
-- ---------------------------------------------------------------------------
create table if not exists resume_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_path text not null,             -- path within the 'resumes' bucket
  kind text not null check (kind in ('original', 'tailored')),
  filename text,
  created_at timestamptz not null default now()
);
create index if not exists idx_resume_files_user on resume_files (user_id);

-- ---------------------------------------------------------------------------
-- missions: the user's goal + parsed preferences
-- ---------------------------------------------------------------------------
create table if not exists missions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  raw_goal text not null,
  preferences jsonb,                      -- MissionPreferences (parsed by Claude)
  status text not null default 'pending'  -- pending | active | paused | done
    check (status in ('pending', 'active', 'paused', 'done')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_missions_user on missions (user_id);
create index if not exists idx_missions_active on missions (is_active) where is_active;

-- ---------------------------------------------------------------------------
-- job_listings: deduped jobs from all sources (shared across users)
-- ---------------------------------------------------------------------------
create table if not exists job_listings (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  external_id text not null,
  title text not null,
  company text not null,
  location text,
  remote boolean not null default false,
  comp_min integer,
  comp_max integer,
  description text not null,
  apply_url text not null,
  apply_method text not null
    check (apply_method in ('ats_api', 'email', 'external_link')),
  apply_email text,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (source, external_id)
);

-- ---------------------------------------------------------------------------
-- job_matches: a job considered for a mission, with score + lifecycle status
-- ---------------------------------------------------------------------------
create table if not exists job_matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  mission_id uuid not null references missions (id) on delete cascade,
  job_id uuid not null references job_listings (id) on delete cascade,
  score integer,
  rationale text,
  status text not null default 'new'
    check (status in
      ('new', 'scored', 'tailoring', 'ready', 'approved',
       'applied', 'rejected', 'skipped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (mission_id, job_id)
);
create index if not exists idx_job_matches_user on job_matches (user_id);
create index if not exists idx_job_matches_mission_status
  on job_matches (mission_id, status);

-- ---------------------------------------------------------------------------
-- applications: the prepared (and eventually submitted) application
-- ---------------------------------------------------------------------------
create table if not exists applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  match_id uuid not null references job_matches (id) on delete cascade,
  tailored_resume_file_id uuid references resume_files (id),
  cover_letter text,
  screening_answers jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'awaiting_approval', 'approved', 'submitted', 'rejected')),
  submission_method text,                 -- 'ats_api' | 'assisted'
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_applications_user on applications (user_id);

-- ---------------------------------------------------------------------------
-- approvals: the review inbox; drives Inngest waitForEvent
-- ---------------------------------------------------------------------------
create table if not exists approvals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  application_id uuid references applications (id) on delete cascade,
  type text not null check (type in ('apply', 'follow_up', 'interview_proposal')),
  payload jsonb not null,
  decision text check (decision in ('approved', 'rejected', 'edited')),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_approvals_user_pending
  on approvals (user_id) where decision is null;

-- ---------------------------------------------------------------------------
-- communications: emails sent/received per application
-- ---------------------------------------------------------------------------
create table if not exists communications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  application_id uuid references applications (id) on delete cascade,
  direction text not null check (direction in ('outbound', 'inbound')),
  gmail_thread_id text,
  gmail_message_id text,
  subject text,
  body text,
  classified_intent text,
  created_at timestamptz not null default now()
);
create index if not exists idx_communications_user on communications (user_id);
create index if not exists idx_communications_thread on communications (gmail_thread_id);

-- ---------------------------------------------------------------------------
-- interviews: scheduling state per application
-- ---------------------------------------------------------------------------
create table if not exists interviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  application_id uuid references applications (id) on delete cascade,
  proposed_slots jsonb,                   -- array of ISO datetime strings
  scheduled_at timestamptz,
  gcal_event_id text,
  status text not null default 'proposed'
    check (status in ('proposed', 'scheduled', 'cancelled')),
  created_at timestamptz not null default now()
);
create index if not exists idx_interviews_user on interviews (user_id);

-- ---------------------------------------------------------------------------
-- integrations: per-user OAuth tokens (encrypted ciphertext stored as text)
-- ---------------------------------------------------------------------------
create table if not exists integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('google')),
  encrypted_tokens text not null,         -- AES-256-GCM ciphertext (see src/lib/crypto.ts)
  scopes text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);
create index if not exists idx_integrations_user on integrations (user_id);

-- ---------------------------------------------------------------------------
-- activity_events: append-only timeline for the activity feed
-- ---------------------------------------------------------------------------
create table if not exists activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  mission_id uuid references missions (id) on delete cascade,
  kind text not null,                     -- e.g. 'jobs_scored', 'resume_tailored'
  message text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_activity_user_created
  on activity_events (user_id, created_at desc);
