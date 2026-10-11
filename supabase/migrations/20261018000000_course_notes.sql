-- Learning: notes on a course (its details page), which can be made public.
-- A course is public through a secret link: `notes_share` holds the link's code while it is public and is empty while it is private.
-- Anyone who has the link can read the notes (and the course title, nothing else) without signing in, through public_course_notes().
-- Safe to run again.

alter table public.courses
  add column if not exists notes text not null default '' check (char_length(notes) <= 20000),
  add column if not exists notes_share uuid,
  add column if not exists notes_updated_at timestamptz;

create unique index if not exists courses_notes_share_idx on public.courses (notes_share) where notes_share is not null;

-- A new course (also one brought back from the Archive, also from a copy made before notes existed) starts private and without a
-- code: a link is only made when the person turns it on. The time of the last change is kept for the public page.
create or replace function public.course_new_defaults() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.category := coalesce(new.category, '');
  new.status := coalesce(new.status, 'active');
  new.notes := coalesce(new.notes, '');
  new.notes_share := null;
  new.notes_updated_at := case when new.notes = '' then null else coalesce(new.notes_updated_at, now()) end;
  return new;
end $$;

create or replace function public.course_notes_stamp() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.notes is distinct from old.notes then
    new.notes_updated_at := case when new.notes = '' then null else now() end;
  end if;
  return new;
end $$;

create or replace trigger courses_notes_stamp
  before update of notes on public.courses
  for each row execute function public.course_notes_stamp();

-- The link code is made by the database, never chosen by the client (a person with their own login can write any column of their own
-- course): any code sent is replaced by the code the course already has, or by a new random one when it had none. So a code that was
-- turned off or deleted cannot be claimed again by someone who remembers it, and turning it on twice keeps the same code.
create or replace function public.course_share_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.notes_share := case when new.notes_share is null then null else coalesce(old.notes_share, gen_random_uuid()) end;
  return new;
end $$;

create or replace trigger courses_share_guard
  before update of notes_share on public.courses
  for each row execute function public.course_share_guard();

-- What the public page may read: the title and the notes of the course whose link code is given, and the time of the last change.
-- This runs with the rights of its owner (the page has no sign-in), so it answers only for an exact code and returns nothing else.
create or replace function public.public_course_notes(p_token uuid)
returns table (title text, notes text, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.title, c.notes, c.notes_updated_at
  from public.courses c
  where p_token is not null and c.notes_share = p_token
$$;

revoke execute on function public.public_course_notes(uuid) from public;
grant execute on function public.public_course_notes(uuid) to anon, authenticated;
