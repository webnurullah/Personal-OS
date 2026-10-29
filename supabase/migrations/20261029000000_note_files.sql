-- Notes: pictures and PDFs kept with a note (up to 10 per note, each up to 4 MB).
-- The file lives in Storage (PRIVATE bucket "note-files", one folder per person, a new random file name for every upload);
-- the table remembers its name, kind and path. The app shows a picture with a short-lived signed address, and opens a PDF
-- the same way, so a file can only be seen by its owner. Deleting a note takes its files with it (they wait in the Archive
-- together with the note and come back with it); a file removed on its own is deleted for good.
-- Safe to run again.

create table if not exists public.note_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  note_id uuid not null references public.notes (id) on delete cascade,
  kind text not null check (kind in ('image', 'pdf')),
  -- The file name as the person knew it ("Invoice 12.pdf"); the stored file has a random name.
  name text not null check (char_length(name) between 1 and 200),
  path text not null unique check (path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$' and split_part(path, '/', 1) = user_id::text),
  size_bytes int not null check (size_bytes between 1 and 4194304),
  created_at timestamptz not null default now()
);

create index if not exists note_files_note_idx on public.note_files (note_id, created_at);
create index if not exists note_files_user_idx on public.note_files (user_id);

alter table public.note_files enable row level security;
drop policy if exists "Own rows" on public.note_files;
create policy "Own rows" on public.note_files for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- Files are added and removed, never edited.
revoke all on public.note_files from anon, authenticated;
grant select, insert, delete on public.note_files to authenticated;

-- Private: the app asks for a signed address when it needs to show a file. The bucket refuses anything above 4 MB (Vercel
-- accepts request bodies up to 4.5 MB) and any other file type.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('note-files', 'note-files', false, 4194304, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- You can add, look up and remove files only inside your own folder (the folder is named after your user id).
drop policy if exists "Note files: add to your own folder" on storage.objects;
create policy "Note files: add to your own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'note-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Note files: look up your own files" on storage.objects;
create policy "Note files: look up your own files" on storage.objects for select to authenticated
  using (bucket_id = 'note-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Note files: remove your own files" on storage.objects;
create policy "Note files: remove your own files" on storage.objects for delete to authenticated
  using (bucket_id = 'note-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Real-time sync: a file added on one device shows on the others.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'note_files') then
    alter publication supabase_realtime add table public.note_files;
  end if;
end $$;

-- The Archive: a deleted note takes its files with it, and they come back when it is restored.
-- (Same as the last version, plus "children" on the note. The files in Storage stay where they are until the Archive entry is deleted for good.)
create or replace function public.archive_config(p_kind text) returns jsonb
language sql immutable set search_path = '' as $$
  select ('{
    "task": {"table": "tasks", "title": "title", "detail": ["due_date"], "fks": [["category_id", "categories", false, "category"], ["project_id", "projects", false, "project"], ["course_id", "courses", false, "course"]]},
    "note": {"table": "notes", "title": "title", "detail": ["tag"], "children": [["note_files", "note_id"]]},
    "event": {"table": "events", "title": "title", "detail": ["event_date"], "fks": [["category_id", "categories", false, "category"]]},
    "goal": {"table": "goals", "title": "title", "detail": ["status"], "fks": [["category_id", "categories", false, "category"], ["course_id", "courses", false, "course"]], "children": [["goal_milestones", "goal_id"]]},
    "milestone": {"table": "goal_milestones", "title": "title", "detail": [], "fks": [["goal_id", "goals", true, "goal"]]},
    "habit": {"table": "habits", "title": "name", "detail": [], "children": [["habit_logs", "habit_id"]]},
    "course": {"table": "courses", "title": "title", "detail": ["subtitle"], "children": [["course_units", "course_id"], ["course_topics", "course_id"], ["learning_resources", "course_id"], ["tasks", "course_id"], ["study_blocks", "course_id"]], "child_fks": {"tasks": [["category_id", "categories"], ["project_id", "projects"]], "learning_resources": [["practice_project_id", "projects"]], "study_blocks": []}, "relinks": [["learning_resources", "course_id"], ["goals", "course_id"]]},
    "unit": {"table": "course_units", "title": "title", "detail": ["code"], "fks": [["course_id", "courses", true, "course"]], "children": [["course_topics", "unit_id"]], "relinks": [["learning_resources", "unit_id"]]},
    "topic": {"table": "course_topics", "title": "title", "detail": ["code"], "fks": [["course_id", "courses", true, "course"], ["unit_id", "course_units", true, "unit"]]},
    "study_block": {"table": "study_blocks", "title": "activity", "detail": ["week_start"], "fks": [["topic_id", "course_topics", false, "topic"], ["resource_id", "learning_resources", false, "resource"], ["course_id", "courses", false, "course"]]},
    "transaction": {"table": "transactions", "title": "description", "detail": ["type", "amount"], "fks": [["budget_category_id", "budget_categories", false, "category"]], "relinks": [["bills", "transaction_id"]]},
    "bill": {"table": "bills", "title": "name", "detail": ["due_date"], "fks": [["budget_category_id", "budget_categories", false, "category"], ["transaction_id", "transactions", false, "transaction"]]},
    "budget_category": {"table": "budget_categories", "title": "name", "detail": [], "relinks": [["transactions", "budget_category_id"], ["bills", "budget_category_id"]]},
    "category": {"table": "categories", "title": "name", "detail": [], "relinks": [["tasks", "category_id"], ["events", "category_id"], ["goals", "category_id"]]},
    "reminder": {"table": "reminders", "title": "text", "detail": ["due_date"]},
    "job": {"table": "job_applications", "title": "title", "detail": ["company"]},
    "resource": {"table": "learning_resources", "title": "title", "detail": ["platform"], "fks": [["course_id", "courses", false, "course"], ["unit_id", "course_units", false, "unit"], ["practice_project_id", "projects", false, "project"]], "relinks": [["study_blocks", "resource_id"]]},
    "company": {"table": "companies", "title": "name", "detail": ["website"]}
  }'::jsonb) -> p_kind
$$;
