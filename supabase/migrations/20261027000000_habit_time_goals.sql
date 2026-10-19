-- Habits: a daily time goal fed by the project / course timers.
-- A habit can have a goal in minutes (target_minutes) and a list of projects and courses whose timer time counts for it (habit_sources).
-- When the time counted today reaches the goal the app ticks the day by itself (once a day: auto_checked_on), and ticking by hand still works.
-- Safe to run again.

alter table public.habits add column if not exists target_minutes integer check (target_minutes between 1 and 1440);
alter table public.habits add column if not exists auto_checked_on date;

create table if not exists public.habit_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  habit_id uuid not null references public.habits (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  course_id uuid references public.courses (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- exactly one of the two
  check ((project_id is null) <> (course_id is null))
);
create unique index if not exists habit_sources_project_idx on public.habit_sources (habit_id, project_id) where project_id is not null;
create unique index if not exists habit_sources_course_idx on public.habit_sources (habit_id, course_id) where course_id is not null;
create index if not exists habit_sources_user_idx on public.habit_sources (user_id);
create index if not exists habit_sources_project_fk_idx on public.habit_sources (project_id) where project_id is not null;
create index if not exists habit_sources_course_fk_idx on public.habit_sources (course_id) where course_id is not null;

alter table public.habit_sources enable row level security;
drop policy if exists "Own rows" on public.habit_sources;
-- Your own rows, for your own habit and your own project or course.
create policy "Own rows" on public.habit_sources for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = (select auth.uid()))
    and (project_id is null or exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid())))
    and (course_id is null or exists (select 1 from public.courses c where c.id = course_id and c.user_id = (select auth.uid())))
  );
revoke all on public.habit_sources from anon;
grant select, insert, update, delete on public.habit_sources to authenticated;
