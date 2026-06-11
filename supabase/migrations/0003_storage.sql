-- Private 'resumes' bucket: holds original uploads and generated tailored PDFs.
-- Objects are namespaced by user id as the first path segment (<user_id>/...),
-- and RLS restricts each user to their own folder.

insert into storage.buckets (id, name, public)
values ('resumes', 'resumes', false)
on conflict (id) do nothing;

-- Each user can read/write only objects whose first path segment is their uid.
create policy "resumes: owner read"
  on storage.objects for select to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "resumes: owner insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "resumes: owner update"
  on storage.objects for update to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "resumes: owner delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);
