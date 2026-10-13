-- Deleting a course takes everything that belongs to it with it: its units and topics (as before), the courses, playlists and
-- certificates collected for it (the Learning library items linked to it), the study sessions logged for it and the tasks made
-- from it ("Study: 2.1 SQL joins"). It all goes to the Archive together and comes back together when the course is restored.
-- Goals that follow the course are not deleted (they lose the link, and get it back on restore), and neither are projects.
-- Safe to run again.

-- Tasks made from a course remember the course.
alter table public.tasks add column if not exists course_id uuid references public.courses (id) on delete cascade;
create index if not exists tasks_course_idx on public.tasks (course_id) where course_id is not null;

-- Study sessions remember the course too: the one of their topic, or else the one of their library item.
alter table public.study_blocks add column if not exists course_id uuid references public.courses (id) on delete cascade;
create index if not exists study_blocks_course_idx on public.study_blocks (course_id) where course_id is not null;

create or replace function public.study_block_course() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.topic_id is not null then
    select t.course_id into new.course_id from public.course_topics t where t.id = new.topic_id;
  elsif new.resource_id is not null then
    select r.course_id into new.course_id from public.learning_resources r where r.id = new.resource_id;
  end if; -- a session with neither keeps what it has
  return new;
end $$;

-- (named so that it runs after study_blocks_topic_ref, which may fill in the topic first)
create or replace trigger study_blocks_zz_course
  before insert or update of topic_id, resource_id on public.study_blocks
  for each row execute function public.study_block_course();

-- What is already there: sessions get the course of their topic or library item; tasks that were made from a course get it from the
-- note they carry ("From the course: <title>"), when no other course has the same title.
update public.study_blocks b set course_id = t.course_id from public.course_topics t where b.topic_id = t.id and b.course_id is null;
update public.study_blocks b set course_id = r.course_id from public.learning_resources r where b.resource_id = r.id and b.course_id is null and r.course_id is not null;
update public.tasks k set course_id = c.id from public.courses c
 where k.course_id is null and k.user_id = c.user_id and k.notes = left('From the course: ' || c.title, 2000)
   and (select count(*) from public.courses c2 where c2.user_id = c.user_id and c2.title = c.title) = 1;

-- A deleted course now takes its library items with it (they used to stay, without a course).
alter table public.learning_resources drop constraint if exists learning_resources_course_id_fkey;
alter table public.learning_resources add constraint learning_resources_course_id_fkey
  foreign key (course_id) references public.courses (id) on delete cascade;

-- The Archive knows what goes with a course.
create or replace function public.archive_config(p_kind text) returns jsonb
language sql immutable set search_path = '' as $$
  select ('{
    "task": {"table": "tasks", "title": "title", "detail": ["due_date"], "fks": [["category_id", "categories", false, "category"], ["project_id", "projects", false, "project"], ["course_id", "courses", false, "course"]]},
    "note": {"table": "notes", "title": "title", "detail": ["tag"]},
    "event": {"table": "events", "title": "title", "detail": ["event_date"], "fks": [["category_id", "categories", false, "category"]]},
    "goal": {"table": "goals", "title": "title", "detail": ["status"], "fks": [["category_id", "categories", false, "category"], ["course_id", "courses", false, "course"]], "children": [["goal_milestones", "goal_id"]]},
    "milestone": {"table": "goal_milestones", "title": "title", "detail": [], "fks": [["goal_id", "goals", true, "goal"]]},
    "habit": {"table": "habits", "title": "name", "detail": [], "children": [["habit_logs", "habit_id"]]},
    "course": {"table": "courses", "title": "title", "detail": ["subtitle"], "children": [["course_units", "course_id"], ["course_topics", "course_id"], ["learning_resources", "course_id"], ["tasks", "course_id"], ["study_blocks", "course_id"]], "child_fks": {"tasks": [["category_id", "categories"], ["project_id", "projects"]], "learning_resources": [["practice_project_id", "projects"]], "study_blocks": []}, "relinks": [["learning_resources", "course_id"], ["goals", "course_id"]]},
    "unit": {"table": "course_units", "title": "title", "detail": ["code"], "fks": [["course_id", "courses", true, "course"]], "children": [["course_topics", "unit_id"]], "relinks": [["learning_resources", "unit_id"]]},
    "topic": {"table": "course_topics", "title": "title", "detail": ["code"], "fks": [["course_id", "courses", true, "course"], ["unit_id", "course_units", true, "unit"]]},
    "study_block": {"table": "study_blocks", "title": "activity", "detail": ["week_start"], "fks": [["topic_id", "course_topics", false, "topic"], ["resource_id", "learning_resources", false, "resource"], ["course_id", "courses", false, "course"]]},
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

-- Clears one link in a list of saved rows when the row it points to is gone ("project_id" of a task whose project was deleted since).
create or replace function public.archive_clear_dead_links(p_rows jsonb, p_column text, p_table text) returns jsonb
language plpgsql set search_path = '' as $$
declare
  result jsonb;
begin
  execute format(
    'select coalesce(jsonb_agg(case when e.value ->> %1$L is not null and not exists (select 1 from public.%2$I x where x.id = (e.value ->> %1$L)::uuid) then e.value || jsonb_build_object(%1$L, null) else e.value end order by e.ord), ''[]''::jsonb) from jsonb_array_elements($1) with ordinality as e(value, ord)',
    p_column, p_table)
    into result using p_rows;
  return result;
end $$;
revoke all on function public.archive_clear_dead_links(jsonb, text, text) from public, anon;
grant execute on function public.archive_clear_dead_links(jsonb, text, text) to authenticated;

-- Puts an Archive entry back where it came from. Returns { kind, id, title }.
-- (Same as before, plus: what came back with a course (its tasks, library items …) may point at a category, a project … that has
-- been deleted since; those links are cleared instead of stopping the whole restore. The config lists them as "child_fks".)
create or replace function public.archive_restore(p_id uuid) returns jsonb
language plpgsql set search_path = '' as $$
declare
  item public.archive_items;
  cfg jsonb;
  r jsonb;
  spec jsonb;
  fk jsonb;
  there boolean;
  child_rows jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  select * into item from public.archive_items where id = p_id;
  if not found then
    raise exception 'Not found.' using errcode = 'P0002';
  end if;
  cfg := public.archive_config(item.kind);
  r := item.data -> 'row';

  -- Links to things that have been deleted since.
  for spec in select * from jsonb_array_elements(coalesce(cfg -> 'fks', '[]')) loop
    if r ->> (spec ->> 0) is not null then
      execute format('select exists (select 1 from public.%I where id = $1)', spec ->> 1) into there using (r ->> (spec ->> 0))::uuid;
      if not there then
        if (spec ->> 2)::boolean then
          raise exception 'The % this belongs to is not in your lists any more. Restore the % from the Archive first, then restore this.', spec ->> 3, spec ->> 3;
        end if;
        r := r || jsonb_build_object(spec ->> 0, null);
      end if;
    end if;
  end loop;

  begin
    execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)', cfg ->> 'table', cfg ->> 'table') using r;
    for spec in select * from jsonb_array_elements(coalesce(cfg -> 'children', '[]')) loop
      child_rows := coalesce(item.data -> 'children' -> (spec ->> 0), '[]');
      if jsonb_array_length(child_rows) > 0 then
        -- Links of these rows to things outside the course that are gone by now are cleared.
        for fk in select * from jsonb_array_elements(coalesce(cfg -> 'child_fks' -> (spec ->> 0), '[]')) loop
          child_rows := public.archive_clear_dead_links(child_rows, fk ->> 0, fk ->> 1);
        end loop;
        execute format('insert into public.%I select * from jsonb_populate_recordset(null::public.%I, $1)', spec ->> 0, spec ->> 0) using child_rows;
      end if;
    end loop;
  exception when unique_violation then
    raise exception 'Something with the same name is already in your lists. Rename or remove it, then restore this again.';
  end;

  -- Rows that lost their link to it get it back (only if they have not been linked to something else since).
  for spec in select * from jsonb_array_elements(coalesce(cfg -> 'relinks', '[]')) loop
    child_rows := coalesce(item.data -> 'relinks' -> ((spec ->> 0) || '.' || (spec ->> 1)), '[]');
    if jsonb_array_length(child_rows) > 0 then
      execute format('update public.%I set %I = $1 where %I is null and id in (select (jsonb_array_elements_text($2))::uuid)', spec ->> 0, spec ->> 1, spec ->> 1)
        using (r ->> 'id')::uuid, child_rows;
    end if;
  end loop;

  delete from public.archive_items where id = p_id;
  return jsonb_build_object('kind', item.kind, 'id', r ->> 'id', 'title', item.title);
end $$;
