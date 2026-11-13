-- Projects: files kept with a project (a brief, designs, a contract, a picture, a PDF, any file), up to 20 per project, each up to 4 MB.
-- The file lives in Storage (PRIVATE bucket "project-files", one folder per person, a new random file name for every upload);
-- the table remembers its name, kind and path. The app previews a picture or a PDF and offers every file for download with
-- a short-lived signed address, so a file can only be seen by its owner. Deleting a project for good deletes its files too.
-- Safe to run again.

create table if not exists public.project_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  -- image and pdf can be previewed in the app; every other file is only downloaded.
  kind text not null check (kind in ('image', 'pdf', 'file')),
  -- The file name as the person knew it ("Brief v2.docx"); the stored file has a random name.
  name text not null check (char_length(name) between 1 and 200),
  path text not null unique check (path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}(\.[a-z0-9]{1,10})?$' and split_part(path, '/', 1) = user_id::text),
  size_bytes int not null check (size_bytes between 1 and 4194304),
  created_at timestamptz not null default now()
);

create index if not exists project_files_project_idx on public.project_files (project_id, created_at);
create index if not exists project_files_user_idx on public.project_files (user_id);

alter table public.project_files enable row level security;
drop policy if exists "Own rows" on public.project_files;
create policy "Own rows" on public.project_files for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- Files are added and removed, never edited.
revoke all on public.project_files from anon, authenticated;
grant select, insert, delete on public.project_files to authenticated;

-- Private: the app asks for a signed address when it needs to show or download a file. Any file type is allowed; the bucket
-- refuses anything above 4 MB (Vercel accepts request bodies up to 4.5 MB). The app never shows a file other than a picture
-- (in an <img>) or a PDF (drawn by pdf.js), and every other file is only ever downloaded.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-files', 'project-files', false, 4194304, null)
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- You can add, look up and remove files only inside your own folder (the folder is named after your user id).
drop policy if exists "Project files: add to your own folder" on storage.objects;
create policy "Project files: add to your own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'project-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Project files: look up your own files" on storage.objects;
create policy "Project files: look up your own files" on storage.objects for select to authenticated
  using (bucket_id = 'project-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Project files: remove your own files" on storage.objects;
create policy "Project files: remove your own files" on storage.objects for delete to authenticated
  using (bucket_id = 'project-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Real-time sync: a file added on one device shows on the others.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'project_files') then
    alter publication supabase_realtime add table public.project_files;
  end if;
end $$;

-- "Delete all my data" removes the stored files in the API route (app/api/data/delete-all), like the other pictures.
