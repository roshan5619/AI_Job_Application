-- Row-Level Security: a logged-in user can only touch their own rows.
-- The service-role key (used by Inngest workers / server routes) bypasses RLS,
-- so workflow code MUST scope every query by user_id itself.

-- Enable RLS on every user-owned table.
alter table candidate_profiles enable row level security;
alter table resume_files       enable row level security;
alter table missions           enable row level security;
alter table job_matches        enable row level security;
alter table applications       enable row level security;
alter table approvals          enable row level security;
alter table communications     enable row level security;
alter table interviews         enable row level security;
alter table integrations       enable row level security;
alter table activity_events    enable row level security;

-- job_listings is shared (not user-owned). Readable by any authenticated user;
-- only the service role may write.
alter table job_listings enable row level security;
create policy "job_listings readable by authenticated"
  on job_listings for select to authenticated using (true);

-- Generic owner policy applied per table. Postgres has no "for all tables"
-- shortcut, so we define one policy per user-owned table.
do $$
declare
  t text;
  owned_tables text[] := array[
    'candidate_profiles', 'resume_files', 'missions', 'job_matches',
    'applications', 'approvals', 'communications', 'interviews',
    'integrations', 'activity_events'
  ];
begin
  foreach t in array owned_tables loop
    execute format(
      'create policy %I on %I for all to authenticated
         using (user_id = auth.uid())
         with check (user_id = auth.uid());',
      t || '_owner', t
    );
  end loop;
end $$;
