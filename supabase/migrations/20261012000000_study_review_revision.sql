-- Learning: connect to the rest.
--  study_weeks.reflection: one line on how the study week went (the weekly review).
--  revision_step: how many of the three look-backs (after 1, 7 and 21 days) of a finished topic or library item are done.
--  goals.link_kind / goals.course_id: a goal whose progress comes from a course (its hours) or from the certificates you earn.
-- A goal whose course is deleted keeps link_kind "course" with no course (the app then shows the numbers typed by hand);
-- when the course is brought back from the Archive the goal gets it back.

alter table public.study_weeks
  add column if not exists reflection text not null default '' check (char_length(reflection) <= 500);

alter table public.course_topics
  add column if not exists revision_step smallint not null default 0 check (revision_step between 0 and 3);
alter table public.learning_resources
  add column if not exists revision_step smallint not null default 0 check (revision_step between 0 and 3);

alter table public.goals
  add column if not exists link_kind text check (link_kind in ('course', 'certificates')),
  add column if not exists course_id uuid references public.courses (id) on delete set null;
create index if not exists goals_course_idx on public.goals (course_id) where course_id is not null;

-- A row brought back from an Archive copy made before this existed arrives with revision_step empty (not 0); it starts at 0.
create or replace function public.revision_step_start() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.revision_step := coalesce(new.revision_step, 0);
  return new;
end $$;

drop trigger if exists course_topics_revision_start on public.course_topics;
create trigger course_topics_revision_start
  before insert on public.course_topics
  for each row execute function public.revision_step_start();
drop trigger if exists learning_resources_revision_start on public.learning_resources;
create trigger learning_resources_revision_start
  before insert on public.learning_resources
  for each row execute function public.revision_step_start();

-- Finishing something again (or un-finishing it) starts its look-backs again, unless the same change sets the step.
create or replace function public.revision_step_restart() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status is distinct from old.status and new.revision_step is not distinct from old.revision_step then
    new.revision_step := 0;
  end if;
  return new;
end $$;

drop trigger if exists course_topics_revision_restart on public.course_topics;
create trigger course_topics_revision_restart
  before update of status on public.course_topics
  for each row execute function public.revision_step_restart();
drop trigger if exists learning_resources_revision_restart on public.learning_resources;
create trigger learning_resources_revision_restart
  before update of status on public.learning_resources
  for each row execute function public.revision_step_restart();

-- The Archive: a goal brought back keeps its course when it still exists; a course brought back gets its goals again.
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
    "resource": {"table": "learning_resources", "title": "title", "detail": ["platform"], "fks": [["course_id", "courses", false, "course"], ["unit_id", "course_units", false, "unit"], ["practice_project_id", "projects", false, "project"]], "relinks": [["study_blocks", "resource_id"]]}
  }'::jsonb) -> p_kind
$$;
