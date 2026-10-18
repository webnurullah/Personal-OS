-- Learning → certificate courses: a timer on every certificate course / playlist in the library (Start now / Resume / Pause).
-- It writes into course_time, the table of the course timer, with the library item in resource_id. So the time lands on the course
-- the item is linked to (course box, course page, Habits) by itself, and only one timer runs at a time (the same unique index).
-- An item that is not linked to a course keeps its time on the item (course_id empty). Deleting an item keeps the time on its
-- course; time of an unlinked item goes with it.
-- Safe to run again.

alter table public.course_time alter column course_id drop not null;
alter table public.course_time add column if not exists resource_id uuid references public.learning_resources (id) on delete set null;
create index if not exists course_time_resource_idx on public.course_time (resource_id, started_at) where resource_id is not null;

alter policy "Own rows" on public.course_time
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (course_id is null or exists (select 1 from public.courses c where c.id = course_id and c.user_id = (select auth.uid()))));

-- A time row names something: a course, a library item, or both.
create or replace function public.course_time_check() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.course_id is null and new.resource_id is null then
    raise exception 'A time row needs a course or a library item' using errcode = '23514';
  end if;
  -- Your own library items only (the select below sees only your rows).
  if new.resource_id is not null and not exists (select 1 from public.learning_resources r where r.id = new.resource_id) then
    raise exception 'That library item is not yours' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace trigger course_time_check_row
  before insert or update on public.course_time
  for each row execute function public.course_time_check();

-- Time kept only on an item (no course) goes with the item when it is deleted.
create or replace function public.resource_time_cleanup() returns trigger
language plpgsql set search_path = '' as $$
begin
  delete from public.course_time where resource_id = old.id and course_id is null;
  return old;
end $$;

create or replace trigger learning_resources_time_cleanup
  before delete on public.learning_resources
  for each row execute function public.resource_time_cleanup();
