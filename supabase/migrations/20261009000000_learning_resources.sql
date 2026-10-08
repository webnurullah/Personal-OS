-- Learning → Certificates & playlists: the courses, YouTube playlists, videos and books you want to complete,
-- the ones you finished, and the certificates you earned. Each item can belong to one of your courses (a subject
-- such as "Digital Marketing") and, once you start practising what you learned, to a practice project.

create table public.learning_resources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- The subject: one of your courses (and optionally one unit of it). Deleting the course keeps the item and its certificate.
  course_id uuid references public.courses (id) on delete set null,
  unit_id uuid references public.course_units (id) on delete set null,
  -- The project you made to practise it (Projects page).
  practice_project_id uuid references public.projects (id) on delete set null,
  kind text not null default 'certificate' check (kind in ('certificate', 'playlist', 'video', 'reading', 'other')),
  title text not null check (char_length(title) between 1 and 300),
  url text not null default '' check (char_length(url) <= 2000),
  -- Where it is: Coursera, Udemy, YouTube … (found from the link). Provider: the channel or school.
  platform text not null default '' check (char_length(platform) <= 60),
  provider text not null default '' check (char_length(provider) <= 120),
  status text not null default 'todo' check (status in ('todo', 'learning', 'completed', 'dropped')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  est_hours numeric(7, 2) not null default 0 check (est_hours between 0 and 1000),
  -- Videos or lessons in it, and how many you have watched. 0 total = not counted.
  items_total int not null default 0 check (items_total between 0 and 5000),
  items_done int not null default 0 check (items_done >= 0),
  -- A deadline to start or finish by (enrolment closes, free access ends …).
  due_date date,
  started_on date,
  completed_on date,
  cost numeric(10, 2) not null default 0 check (cost >= 0),
  -- What it teaches, e.g. {"SEO", "Google Analytics"}.
  skills text[] not null default '{}',
  rating smallint check (rating between 1 and 5),
  -- "What I can do now" in one line, and why it was dropped.
  takeaway text not null default '' check (char_length(takeaway) <= 300),
  dropped_reason text not null default '' check (char_length(dropped_reason) <= 300),
  notes text not null default '' check (char_length(notes) <= 2000),
  certificate_url text not null default '' check (char_length(certificate_url) <= 2000),
  certificate_id text not null default '' check (char_length(certificate_id) <= 120),
  issued_on date,
  expires_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learning_resources_progress_check check (items_done <= items_total),
  constraint learning_resources_certificate_dates_check check (expires_on is null or issued_on is null or expires_on >= issued_on)
);

create index learning_resources_user_status_idx on public.learning_resources (user_id, status);
create index learning_resources_course_idx on public.learning_resources (course_id);
create index learning_resources_unit_idx on public.learning_resources (unit_id);
create index learning_resources_practice_project_idx on public.learning_resources (practice_project_id);
create trigger learning_resources_updated_at before update on public.learning_resources for each row execute function public.set_updated_at();

alter table public.learning_resources enable row level security;
create policy "Own rows" on public.learning_resources for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.learning_resources from anon;
grant select, insert, update, delete on public.learning_resources to authenticated;

-- The Archive knows the new kind. Deleting a course or a unit only clears the link of its items (they stay in
-- the library); restoring the course or unit links them again.
alter table public.archive_items drop constraint archive_items_kind_check;
alter table public.archive_items add constraint archive_items_kind_check check (kind in (
  'task', 'note', 'event', 'goal', 'milestone', 'habit', 'course', 'unit', 'topic', 'study_block',
  'transaction', 'bill', 'budget_category', 'category', 'reminder', 'job', 'resource'
));

create or replace function public.archive_config(p_kind text) returns jsonb
language sql immutable set search_path = '' as $$
  select ('{
    "task": {"table": "tasks", "title": "title", "detail": ["due_date"], "fks": [["category_id", "categories", false, "category"], ["project_id", "projects", false, "project"]]},
    "note": {"table": "notes", "title": "title", "detail": ["tag"]},
    "event": {"table": "events", "title": "title", "detail": ["event_date"], "fks": [["category_id", "categories", false, "category"]]},
    "goal": {"table": "goals", "title": "title", "detail": ["status"], "fks": [["category_id", "categories", false, "category"]], "children": [["goal_milestones", "goal_id"]]},
    "milestone": {"table": "goal_milestones", "title": "title", "detail": [], "fks": [["goal_id", "goals", true, "goal"]]},
    "habit": {"table": "habits", "title": "name", "detail": [], "children": [["habit_logs", "habit_id"]]},
    "course": {"table": "courses", "title": "title", "detail": ["subtitle"], "children": [["course_units", "course_id"], ["course_topics", "course_id"]], "relinks": [["learning_resources", "course_id"]]},
    "unit": {"table": "course_units", "title": "title", "detail": ["code"], "fks": [["course_id", "courses", true, "course"]], "children": [["course_topics", "unit_id"]], "relinks": [["learning_resources", "unit_id"]]},
    "topic": {"table": "course_topics", "title": "title", "detail": ["code"], "fks": [["course_id", "courses", true, "course"], ["unit_id", "course_units", true, "unit"]]},
    "study_block": {"table": "study_blocks", "title": "activity", "detail": ["week_start"]},
    "transaction": {"table": "transactions", "title": "description", "detail": ["type", "amount"], "fks": [["budget_category_id", "budget_categories", false, "category"]]},
    "bill": {"table": "bills", "title": "name", "detail": ["due_date"], "fks": [["budget_category_id", "budget_categories", false, "category"], ["transaction_id", "transactions", false, "transaction"]]},
    "budget_category": {"table": "budget_categories", "title": "name", "detail": [], "relinks": [["transactions", "budget_category_id"], ["bills", "budget_category_id"]]},
    "category": {"table": "categories", "title": "name", "detail": [], "relinks": [["tasks", "category_id"], ["events", "category_id"], ["goals", "category_id"]]},
    "reminder": {"table": "reminders", "title": "text", "detail": ["due_date"]},
    "job": {"table": "job_applications", "title": "title", "detail": ["company"]},
    "resource": {"table": "learning_resources", "title": "title", "detail": ["platform"], "fks": [["course_id", "courses", false, "course"], ["unit_id", "course_units", false, "unit"], ["practice_project_id", "projects", false, "project"]]}
  }'::jsonb) -> p_kind
$$;

-- "Delete all my data" removes the library in the API route (app/api/data/delete-all) before calling delete_my_data().
