-- Job Apply → Company list: the companies you follow (name, website, Facebook, LinkedIn, a note).
-- A company can be added from a job's box with one tap; matching a job to a company is by name (not a link in the database).

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  website text not null default '' check (char_length(website) <= 500),
  facebook text not null default '' check (char_length(facebook) <= 500),
  linkedin text not null default '' check (char_length(linkedin) <= 500),
  note text not null default '' check (char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One entry per company name (capital letters and spaces at the ends do not make a second one).
create unique index if not exists companies_user_name_idx on public.companies (user_id, lower(btrim(name)));
drop trigger if exists companies_updated_at on public.companies;
create trigger companies_updated_at before update on public.companies for each row execute function public.set_updated_at();

alter table public.companies enable row level security;
drop policy if exists "Own rows" on public.companies;
create policy "Own rows" on public.companies for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.companies from anon;
grant select, insert, update, delete on public.companies to authenticated;

-- "Delete all my data" removes the companies in the API route (app/api/data/delete-all), like the saved jobs.

-- The Archive knows the new kind.
alter table public.archive_items drop constraint archive_items_kind_check;
alter table public.archive_items add constraint archive_items_kind_check check (kind in (
  'task', 'note', 'event', 'goal', 'milestone', 'habit', 'course', 'unit', 'topic', 'study_block',
  'transaction', 'bill', 'budget_category', 'category', 'reminder', 'job', 'resource', 'company'
));

create or replace function public.archive_config(p_kind text) returns jsonb
language sql immutable set search_path = '' as $$
  select ('{
    "task": {"table": "tasks", "title": "title", "detail": ["due_date"], "fks": [["category_id", "categories", false, "category"], ["project_id", "projects", false, "project"]]},
    "note": {"table": "notes", "title": "title", "detail": ["tag"]},
    "event": {"table": "events", "title": "title", "detail": ["event_date"], "fks": [["category_id", "categories", false, "category"]]},
    "goal": {"table": "goals", "title": "title", "detail": ["status"], "fks": [["category_id", "categories", false, "category"], ["course_id", "courses", false, "course"]], "children": [["goal_milestones", "goal_id"]]},
    "milestone": {"table": "goal_milestones", "title": "title", "detail": [], "fks": [["goal_id", "goals", true, "goal"]]},
    "habit": {"table": "habits", "title": "name", "detail": [], "children": [["habit_logs", "habit_id"]]},
    "course": {"table": "courses", "title": "title", "detail": ["subtitle"], "children": [["course_units", "course_id"], ["course_topics", "course_id"]], "relinks": [["learning_resources", "course_id"], ["goals", "course_id"]]},
    "unit": {"table": "course_units", "title": "title", "detail": ["code"], "fks": [["course_id", "courses", true, "course"]], "children": [["course_topics", "unit_id"]], "relinks": [["learning_resources", "unit_id"]]},
    "topic": {"table": "course_topics", "title": "title", "detail": ["code"], "fks": [["course_id", "courses", true, "course"], ["unit_id", "course_units", true, "unit"]]},
    "study_block": {"table": "study_blocks", "title": "activity", "detail": ["week_start"], "fks": [["topic_id", "course_topics", false, "topic"], ["resource_id", "learning_resources", false, "resource"]]},
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
