-- Learning: one progress record.
-- A study session (a block) can name the topic it was about, or a course/playlist from the library. A finished session
-- adds its hours to that topic's "Spent" hours by itself, so the same hours are never typed twice.
--
-- How the hours add up: a topic keeps the hours typed by hand (manual_hours) and its Spent hours (actual_hours) are always
--   manual_hours + the hours of its finished sessions.
-- They are worked out again from the sessions every time one changes, never added to or taken off, so ticking, un-ticking,
-- editing, moving, deleting and restoring a session can never leave the total out by a few hours. Typing a number into
-- "Spent" sets the total: the part not explained by sessions becomes manual_hours (it cannot go below the sessions).

alter table public.study_blocks
  add column if not exists topic_id uuid references public.course_topics (id) on delete set null,
  -- The topic this session was about, kept when the topic is deleted (topic_id is then cleared). If the topic is brought
  -- back from the Archive, its sessions find it again by this.
  add column if not exists topic_ref uuid,
  add column if not exists resource_id uuid references public.learning_resources (id) on delete set null;
create index if not exists study_blocks_topic_idx on public.study_blocks (topic_id) where topic_id is not null;
create index if not exists study_blocks_topic_ref_idx on public.study_blocks (topic_ref) where topic_ref is not null;
create index if not exists study_blocks_resource_idx on public.study_blocks (resource_id) where resource_id is not null;

alter table public.course_topics
  -- Empty only for a moment: a new row arrives with it empty and the trigger below fills it in (see course_topic_new_hours).
  add column if not exists manual_hours numeric(6, 2) check (manual_hours >= 0),
  -- When a topic was finished (for the weekly review and revision). Topics finished before this existed stay empty,
  -- also when one of them is brought back from the Archive (an older copy has no time: it is not stamped with today).
  add column if not exists completed_at timestamptz;

-- Every hour typed so far was typed by hand (no session was linked to a topic before this). Safe to run twice: only
-- topics that have no hand-typed share yet are filled.
update public.course_topics t
   set manual_hours = greatest(0, t.actual_hours - coalesce((select sum(b.hours) from public.study_blocks b where b.topic_id = t.id and b.done), 0))
 where t.manual_hours is null;

-- ---------- Topics ----------

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

-- Every new topic gets its Spent hours worked out when it is added, so they are right whatever the row came with:
--  * a topic brought back from the Archive: its sessions (the ones that are still about it, even though they lost the link)
--    give its session hours; the hand-typed share is what the copy says, whatever happened to the sessions meanwhile.
--  * a topic added with hours (typed, the sample data) or brought back from a copy made before this existed: the row has no
--    hand-typed share (it arrives empty), and all of its hours were typed by hand.
-- (The share arrives empty, not 0, in those cases; this runs before a row is checked, so nothing is ever stored empty.)
create or replace function public.course_topic_new_hours() returns trigger
language plpgsql set search_path = '' as $$
declare
  logged numeric;
begin
  select coalesce(sum(b.hours), 0) into logged from public.study_blocks b where b.topic_ref = new.id and b.done;
  if new.manual_hours is null then
    new.manual_hours := greatest(0, coalesce(new.actual_hours, 0) - logged);
  end if;
  new.actual_hours := new.manual_hours + logged;
  return new;
end $$;

drop trigger if exists course_topics_new_hours on public.course_topics;
create trigger course_topics_new_hours
  before insert on public.course_topics
  for each row execute function public.course_topic_new_hours();

-- Typing a number into "Spent" sets the total. The sessions are part of it; the rest is the hand-typed share.
-- (When the sessions themselves change the total, this works out the same hand-typed share again.)
create or replace function public.course_topic_typed_hours() returns trigger
language plpgsql set search_path = '' as $$
declare
  logged numeric;
begin
  if new.actual_hours is distinct from old.actual_hours then
    select coalesce(sum(b.hours), 0) into logged from public.study_blocks b where b.topic_id = new.id and b.done;
    new.manual_hours := greatest(0, new.actual_hours - logged);
    new.actual_hours := new.manual_hours + logged;
  end if;
  return new;
end $$;

drop trigger if exists course_topics_typed_hours on public.course_topics;
create trigger course_topics_typed_hours
  before update of actual_hours on public.course_topics
  for each row execute function public.course_topic_typed_hours();

-- A topic that is back (from the Archive) takes its sessions back: the ones that were about it and lost the link.
create or replace function public.course_topic_take_sessions_back() returns trigger
language plpgsql set search_path = '' as $$
begin
  update public.study_blocks set topic_id = new.id where topic_ref = new.id and topic_id is null;
  return new;
end $$;

drop trigger if exists course_topics_take_sessions_back on public.course_topics;
create trigger course_topics_take_sessions_back
  after insert on public.course_topics
  for each row execute function public.course_topic_take_sessions_back();

-- ---------- Sessions ----------

-- While a session names a topic, that is the topic it is "about", also after the topic is deleted.
-- A session that is added (or brought back from the Archive) with no topic, but that was about a topic that exists, goes
-- back to it. (Only when it is added: taking the topic off a session later keeps it off.)
create or replace function public.study_block_topic_ref() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.topic_id is null and new.topic_ref is not null
     and exists (select 1 from public.course_topics t where t.id = new.topic_ref) then
    new.topic_id := new.topic_ref;
  end if;
  if new.topic_id is not null then
    new.topic_ref := new.topic_id;
  end if;
  return new;
end $$;

drop trigger if exists study_blocks_topic_ref on public.study_blocks;
create trigger study_blocks_topic_ref
  before insert or update of topic_id on public.study_blocks
  for each row execute function public.study_block_topic_ref();

-- Works out the Spent hours of the topics a session was or is about, from their finished sessions.
-- The first hours on a topic that was "not started" also move it to "in progress".
create or replace function public.study_block_hours() returns trigger
language plpgsql set search_path = '' as $$
declare
  old_topic uuid;
  new_topic uuid;
begin
  if tg_op <> 'INSERT' then old_topic := old.topic_id; end if;
  if tg_op <> 'DELETE' then new_topic := new.topic_id; end if;
  if old_topic is null and new_topic is null then
    return coalesce(new, old);
  end if;
  update public.course_topics t
     set actual_hours = coalesce(t.manual_hours, 0) + coalesce((select sum(b.hours) from public.study_blocks b where b.topic_id = t.id and b.done), 0),
         status = case when t.status = 'not-started' and exists (select 1 from public.study_blocks b where b.topic_id = t.id and b.done) then 'in-progress' else t.status end
   where t.id in (old_topic, new_topic);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists study_blocks_hours on public.study_blocks;
create trigger study_blocks_hours
  after insert or update of hours, done, topic_id or delete on public.study_blocks
  for each row execute function public.study_block_hours();

-- ---------- The Archive ----------

-- A session brought back keeps its topic or library item when they still exist, and loses the link when they do not
-- (a topic that is brought back later takes its sessions back by itself, see above).
-- A library item brought back gets its sessions again.
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
