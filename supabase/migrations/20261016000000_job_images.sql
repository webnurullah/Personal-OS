-- Job Apply: one picture per saved job (a screenshot of the job post or circular).
-- The file lives in Storage (public bucket "job-images", one folder per person, a new random file name for every
-- upload). The job only remembers the path. Same design as the profile photo (20261008000000_profile_photo.sql).
-- Safe to run again.

alter table public.job_applications add column if not exists image_path text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'job_applications_image_path_check') then
    alter table public.job_applications add constraint job_applications_image_path_check
      check (image_path is null or image_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$');
  end if;
end $$;

-- Public: the picture is shown with a plain <img> (no sign-in header), and the address cannot be guessed.
-- The app sends a JPEG of about 200-800 KB; the bucket itself refuses anything above 3 MB and any other file type.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('job-images', 'job-images', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- You can add, look up and remove files only inside your own folder (the folder is named after your user id).
drop policy if exists "Job images: add to your own folder" on storage.objects;
create policy "Job images: add to your own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'job-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Job images: look up your own files" on storage.objects;
create policy "Job images: look up your own files" on storage.objects for select to authenticated
  using (bucket_id = 'job-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Job images: remove your own files" on storage.objects;
create policy "Job images: remove your own files" on storage.objects for delete to authenticated
  using (bucket_id = 'job-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
