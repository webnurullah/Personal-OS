-- Archive, step 2 of 2: run this in Supabase -> SQL Editor -> New query -> paste the WHOLE file -> Run.
-- (Step 1, the Archive table and the list of item types, is already in your database.)
-- Part 1 adds the two functions that move an item into the Archive and bring it back.
-- Part 2 (at the end) has small fixes found in review. The whole file is safe to run again.

-- Moves one item (with what goes with it) from its table into the Archive. Returns the Archive entry's id.
-- Runs with your own rights, so Row Level Security still decides what you can see and delete.
create or replace function public.archive_delete(p_kind text, p_id uuid) returns uuid
language plpgsql set search_path = '' as $$
declare
  cfg jsonb := public.archive_config(p_kind);
  r jsonb;
  spec jsonb;
  found_rows jsonb;
  children jsonb := '{}';
  relinks jsonb := '{}';
  n int := 0;
  v_title text;
  v_detail text;
  new_id uuid;
  n_deleted int;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if cfg is null then
    raise exception 'Unknown kind of item.';
  end if;

  execute format('select to_jsonb(t) from public.%I t where t.id = $1', cfg ->> 'table') into r using p_id;
  if r is null then
    raise exception 'Not found.' using errcode = 'P0002';
  end if;

  for spec in select * from jsonb_array_elements(coalesce(cfg -> 'children', '[]')) loop
    execute format('select coalesce(jsonb_agg(to_jsonb(c)), ''[]''::jsonb) from public.%I c where c.%I = $1', spec ->> 0, spec ->> 1)
      into found_rows using p_id;
    children := children || jsonb_build_object(spec ->> 0, found_rows);
    n := n + jsonb_array_length(found_rows);
  end loop;

  for spec in select * from jsonb_array_elements(coalesce(cfg -> 'relinks', '[]')) loop
    execute format('select coalesce(jsonb_agg(c.id), ''[]''::jsonb) from public.%I c where c.%I = $1', spec ->> 0, spec ->> 1)
      into found_rows using p_id;
    relinks := relinks || jsonb_build_object((spec ->> 0) || '.' || (spec ->> 1), found_rows);
  end loop;

  v_title := left(coalesce(nullif(btrim(r ->> (cfg ->> 'title')), ''), 'Untitled'), 300);
  select left(coalesce(string_agg(nullif(btrim(r ->> d.c), ''), ' ' order by d.o), ''), 300)
    into v_detail
    from jsonb_array_elements_text(coalesce(cfg -> 'detail', '[]')) with ordinality as d(c, o);

  insert into public.archive_items (user_id, kind, title, detail, related, data)
  values (auth.uid(), p_kind, v_title, v_detail, n, jsonb_build_object('row', r, 'children', children, 'relinks', relinks))
  returning id into new_id;

  -- Rows that depended on it (milestones, units, history …) go with it; links from other rows are cleared.
  execute format('delete from public.%I where id = $1', cfg ->> 'table') using p_id;
  get diagnostics n_deleted = row_count;
  if n_deleted = 0 then
    -- Another tab (or a double click) moved it first: undo this entry, so the item is never in the Archive twice.
    raise exception 'Not found.' using errcode = 'P0002';
  end if;
  return new_id;
end $$;

-- Puts an Archive entry back where it came from. Returns { kind, id, title }.
create or replace function public.archive_restore(p_id uuid) returns jsonb
language plpgsql set search_path = '' as $$
declare
  item public.archive_items;
  cfg jsonb;
  r jsonb;
  spec jsonb;
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

revoke execute on function public.archive_config(text) from public, anon;
revoke execute on function public.archive_delete(text, uuid) from public, anon;
revoke execute on function public.archive_restore(uuid) from public, anon;
grant execute on function public.archive_config(text) to authenticated;
grant execute on function public.archive_delete(text, uuid) to authenticated;
grant execute on function public.archive_restore(uuid) to authenticated;

-- ---- Part 2: fixes from the review (also in supabase/migrations/20261009000100_archive_fixes.sql). Safe to run twice. ----
-- Fixes found by the review of the Archive and the Learning library. Safe to run twice.
--  1. Restoring a transaction puts its bill's link back (bills.transaction_id is cleared when a transaction is deleted).
--  2. A library item's unit always belongs to its course: when they disagree (an item moved to another course, then an
--     old unit restored), the unit link is dropped instead of pointing into another course.

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
    "transaction": {"table": "transactions", "title": "description", "detail": ["type", "amount"], "fks": [["budget_category_id", "budget_categories", false, "category"]], "relinks": [["bills", "transaction_id"]]},
    "bill": {"table": "bills", "title": "name", "detail": ["due_date"], "fks": [["budget_category_id", "budget_categories", false, "category"], ["transaction_id", "transactions", false, "transaction"]]},
    "budget_category": {"table": "budget_categories", "title": "name", "detail": [], "relinks": [["transactions", "budget_category_id"], ["bills", "budget_category_id"]]},
    "category": {"table": "categories", "title": "name", "detail": [], "relinks": [["tasks", "category_id"], ["events", "category_id"], ["goals", "category_id"]]},
    "reminder": {"table": "reminders", "title": "text", "detail": ["due_date"]},
    "job": {"table": "job_applications", "title": "title", "detail": ["company"]},
    "resource": {"table": "learning_resources", "title": "title", "detail": ["platform"], "fks": [["course_id", "courses", false, "course"], ["unit_id", "course_units", false, "unit"], ["practice_project_id", "projects", false, "project"]]}
  }'::jsonb) -> p_kind
$$;

create or replace function public.learning_resources_unit_in_course() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.unit_id is not null
     and new.course_id is distinct from (select u.course_id from public.course_units u where u.id = new.unit_id) then
    new.unit_id := null;
  end if;
  return new;
end $$;

drop trigger if exists learning_resources_unit_in_course on public.learning_resources;
create trigger learning_resources_unit_in_course
  before insert or update of unit_id, course_id on public.learning_resources
  for each row execute function public.learning_resources_unit_in_course();
