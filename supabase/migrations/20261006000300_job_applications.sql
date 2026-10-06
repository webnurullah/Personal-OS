-- Applications → Job Apply: jobs saved from a link, and the skills you already have.

-- Your own skills (matched against each job's required skills to show what to learn).
alter table public.profiles add column skills text[] not null default '{}';

create table public.job_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  url text not null default '' check (char_length(url) <= 2000),
  title text not null check (char_length(title) between 1 and 200),
  company text not null default '' check (char_length(company) <= 200),
  location text not null default '' check (char_length(location) <= 200),
  -- Last date to apply (null when the post does not say).
  deadline date,
  status text not null default 'saved' check (status in ('saved', 'applied', 'interview', 'offer', 'rejected')),
  applied_on date,
  summary text not null default '' check (char_length(summary) <= 2000),
  requirements text[] not null default '{}',
  -- Short skill names the job asks for, e.g. {"React", "SQL", "Communication"}.
  skills text[] not null default '{}',
  notes text not null default '' check (char_length(notes) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index job_applications_user_deadline_idx on public.job_applications (user_id, deadline);
create trigger job_applications_updated_at before update on public.job_applications for each row execute function public.set_updated_at();

alter table public.job_applications enable row level security;
create policy "Own rows" on public.job_applications for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.job_applications from anon;
grant select, insert, update, delete on public.job_applications to authenticated;

-- "Delete all my data" removes saved jobs in the API route (app/api/data/delete-all) before
-- calling delete_my_data(), so that function stays as it is.
