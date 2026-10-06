-- Profile photo: one small square picture per person.
-- The file lives in Storage (public bucket "avatars", one folder per person, a new random file name for every
-- upload so browsers and the CDN never show an old picture). The profile only remembers the path.

alter table public.profiles add column avatar_path text;
alter table public.profiles add constraint profiles_avatar_path_check
  check (avatar_path is null or avatar_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$');

-- Public: the picture is shown with a plain <img> (no sign-in header), and the address cannot be guessed.
-- Only pictures up to 512 KB (the app sends about 20 KB) in these three formats are accepted.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 524288, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- You can add, look up and remove files only inside your own folder (the folder is named after your user id).
-- The look-up policy is what lets the Storage service find the file it is asked to remove. Reading a picture
-- by its address does not need it.
create policy "Avatars: add to your own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Avatars: look up your own files" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Avatars: remove your own files" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
