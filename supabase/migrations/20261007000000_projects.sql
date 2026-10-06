-- Projects: the different things you work on (websites, a social media routine, personal branding …).
-- A project can be dated (start and due date) or ongoing (no due date). Tasks can belong to a project.

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  kind text not null default 'other' check (kind in ('website', 'social', 'brand', 'other')),
  status text not null default 'active' check (status in ('active', 'paused', 'done')),
  color public.color_name not null default 'blue',
  -- Who it is for. Empty means it is your own project.
  client text not null default '' check (char_length(client) <= 120),
  goal text not null default '' check (char_length(goal) <= 300),
  -- Both optional. No due date = an ongoing project.
  start_date date,
  due_date date,
  -- [{ "label": "Staging", "url": "https://…" }, …] (checked as http(s) by the API)
  links jsonb not null default '[]' check (case when jsonb_typeof(links) = 'array' then jsonb_array_length(links) <= 12 else false end),
  notes text not null default '' check (char_length(notes) <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_date is null or start_date is null or due_date >= start_date)
);

create index projects_user_status_idx on public.projects (user_id, status);
create trigger projects_updated_at before update on public.projects for each row execute function public.set_updated_at();

alter table public.projects enable row level security;
create policy "Own rows" on public.projects for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.projects from anon;
grant select, insert, update, delete on public.projects to authenticated;

-- A task can belong to a project. Deleting a project deletes its tasks too.
alter table public.tasks add column project_id uuid references public.projects (id) on delete cascade;
create index tasks_project_idx on public.tasks (project_id);

-- "Delete all my data" removes projects in the API route (app/api/data/delete-all) before
-- calling delete_my_data(); their tasks go with them, so that function stays as it is.
