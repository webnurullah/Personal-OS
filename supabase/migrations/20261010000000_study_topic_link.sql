-- Learning: one progress record.
-- A study session (a block) can name the topic it was about, or a course/playlist from the library. A finished session
-- adds its hours to that topic's "Spent" hours by itself, so the same hours are never typed twice.
-- Hours typed into a topic by hand before are left as they are; sessions only add to them.

alter table public.study_blocks
  add column if not exists topic_id uuid references public.course_topics (id) on delete set null,
  add column if not exists resource_id uuid references public.learning_resources (id) on delete set null;
create index if not exists study_blocks_topic_idx on public.study_blocks (topic_id) where topic_id is not null;
create index if not exists study_blocks_resource_idx on public.study_blocks (resource_id) where resource_id is not null;

-- When a topic was finished (kept for the weekly review and revision). Topics finished before this existed stay empty,
-- also when one of them is brought back from the Archive (an older copy has no time: it is not stamped with today).
alter table public.course_topics add column if not exists completed_at timestamptz;

create or replace function public.course_topic_completed_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'done' then
    if tg_op = 'INSERT' or old.status is distinct from 'done' then
      -- Finishing a topic stamps it; so does adding one that is new right now. A topic that is old (brought back
      -- from the Archive) keeps the time it had, which may be none.
      if tg_op = 'UPDATE' or new.created_at > now() - interval '1 minute' then
        new.completed_at := coalesce(new.completed_at, now());
      end if;
    end if;
  else
    new.completed_at := null;
  end if;
  return new;
end $$;

drop trigger if exists course_topics_completed_at on public.course_topics;
create trigger course_topics_completed_at
  before insert or update of status on public.course_topics
  for each row execute function public.course_topic_completed_at();

-- Keeps course_topics.actual_hours in step with the finished sessions that name the topic.
-- Adding, ticking, un-ticking, changing the hours, moving to another topic and removing a session all work out
-- the same way: take the old session's hours off its topic, put the new session's hours on its topic.
-- The first hours on a topic that was "not started" also move it to "in progress". Hours never go below 0.
create or replace function public.study_block_hours() returns trigger
language plpgsql set search_path = '' as $$
declare
  old_hours numeric := 0;
  new_hours numeric := 0;
  old_topic uuid;
  new_topic uuid;
begin
  if tg_op <> 'INSERT' then
    old_topic := old.topic_id;
    if old.done and old_topic is not null then old_hours := old.hours; end if;
  end if;
  if tg_op <> 'DELETE' then
    new_topic := new.topic_id;
    if new.done and new_topic is not null then new_hours := new.hours; end if;
  end if;

  if tg_op = 'UPDATE' and old_topic is not distinct from new_topic then
    -- Same topic: only the difference matters.
    if new_topic is not null and new_hours <> old_hours then
      update public.course_topics
         set actual_hours = greatest(0, actual_hours + (new_hours - old_hours)),
             status = case when new_hours > old_hours and status = 'not-started' then 'in-progress' else status end
       where id = new_topic;
    end if;
  else
    if old_topic is not null and old_hours <> 0 then
      update public.course_topics set actual_hours = greatest(0, actual_hours - old_hours) where id = old_topic;
    end if;
    if new_topic is not null and new_hours <> 0 then
      update public.course_topics
         set actual_hours = actual_hours + new_hours,
             status = case when status = 'not-started' then 'in-progress' else status end
       where id = new_topic;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists study_blocks_hours on public.study_blocks;
create trigger study_blocks_hours
  after insert or update of hours, done, topic_id or delete on public.study_blocks
  for each row execute function public.study_block_hours();

-- The Archive: a session brought back keeps its topic or library item when they still exist, and loses the link when they do not.
-- A library item brought back gets its sessions again. A topic (or its unit or course) brought back does not: its hours
-- are already in the copy that comes back, and linking its sessions again would add them a second time.
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
