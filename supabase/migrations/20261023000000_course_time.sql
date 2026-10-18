-- Courses → time spent: the same timer as on a project page, on every course page (Start / Pause / Continue).
-- One row per Start → Pause; the total of a course is the sum of its rows. Only ONE timer runs at a time across projects AND
-- courses (the app pauses the other one when you start). A session is never longer than 12 hours. The time shows on the Habits
-- page next to the project time. Deleting a course deletes its time rows.
-- Safe to run again.

create table if not exists public.course_time (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at),
  check (ended_at is null or ended_at <= started_at + interval '12 hours')
);

create unique index if not exists course_time_one_running_idx on public.course_time (user_id) where ended_at is null;
create index if not exists course_time_course_idx on public.course_time (course_id, started_at);
create index if not exists course_time_user_idx on public.course_time (user_id, started_at);

alter table public.course_time enable row level security;
drop policy if exists "Own rows" on public.course_time;
-- Your own rows, and only for one of your own courses.
create policy "Own rows" on public.course_time for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (select 1 from public.courses c where c.id = course_id and c.user_id = (select auth.uid())));
revoke all on public.course_time from anon;
grant select, insert, update, delete on public.course_time to authenticated;
