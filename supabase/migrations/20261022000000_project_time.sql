-- Projects → time spent: a timer on each project page. Every time you press Start and later Pause, one row is kept
-- (when it started, when it ended). The total of a project is the sum of its rows, so starting again carries on from the
-- time already spent. Only ONE timer can run at a time (starting another project's timer stops the first). The time per
-- project and per day also shows on the Habits page. Deleting a project deletes its time rows.
-- A session is never longer than 12 hours (a timer left running overnight is cut there, by the app and by this table).
-- Safe to run again.

create table if not exists public.project_time (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at),
  check (ended_at is null or ended_at <= started_at + interval '12 hours')
);

-- One running timer per person (a row with no end).
create unique index if not exists project_time_one_running_idx on public.project_time (user_id) where ended_at is null;
create index if not exists project_time_project_idx on public.project_time (project_id, started_at);
create index if not exists project_time_user_idx on public.project_time (user_id, started_at);

alter table public.project_time enable row level security;
drop policy if exists "Own rows" on public.project_time;
-- Your own rows, and only for one of your own projects.
create policy "Own rows" on public.project_time for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid())));
revoke all on public.project_time from anon;
grant select, insert, update, delete on public.project_time to authenticated;

-- Not an Archive kind: the time rows go to the Archive with nothing; they are removed when the project is deleted for good.
