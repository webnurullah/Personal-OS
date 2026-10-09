-- Learning: faster setup.
--  add_course_outline: adds units and topics to a course in one go (a pasted outline or a template), all or nothing.
--  plan_course: sets the week of many topics and the course's weekly plan in one go, all or nothing.
-- Both run as the person calling (row level security applies), and both only add or update: nothing is removed.

create or replace function public.add_course_outline(p_course uuid, p_units jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare
  u jsonb;
  t jsonb;
  new_unit uuid;
  made_units integer := 0;
  made_topics integer := 0;
begin
  if jsonb_typeof(p_units) is distinct from 'array' or jsonb_array_length(p_units) > 30 then
    raise exception 'An outline can have up to 30 units.' using errcode = 'P0001';
  end if;
  perform 1 from public.courses where id = p_course;
  if not found then
    raise exception 'Not found.' using errcode = 'P0002';
  end if;

  for u in select * from jsonb_array_elements(p_units) loop
    if made_topics + jsonb_array_length(coalesce(u -> 'topics', '[]'::jsonb)) > 300 then
      raise exception 'An outline can have up to 300 topics.' using errcode = 'P0001';
    end if;
    insert into public.course_units (course_id, code, title, color, position)
      values (p_course, u ->> 'code', coalesce(u ->> 'title', ''), (u ->> 'color')::public.color_name, (u ->> 'position')::integer)
      returning id into new_unit;
    made_units := made_units + 1;
    for t in select * from jsonb_array_elements(coalesce(u -> 'topics', '[]'::jsonb)) loop
      insert into public.course_topics (course_id, unit_id, code, title, est_hours, planned_week, position)
        values (p_course, new_unit, t ->> 'code', t ->> 'title', (t ->> 'est_hours')::numeric, nullif(t ->> 'planned_week', '')::smallint, (t ->> 'position')::integer);
      made_topics := made_topics + 1;
    end loop;
  end loop;
  return jsonb_build_object('units', made_units, 'topics', made_topics);
end $$;

create or replace function public.plan_course(p_course uuid, p_weeks jsonb, p_weekly_plan numeric[]) returns integer
language plpgsql set search_path = '' as $$
declare
  changed integer;
begin
  if jsonb_typeof(p_weeks) is distinct from 'array' then
    raise exception 'The weeks must be a list.' using errcode = 'P0001';
  end if;
  if coalesce(array_length(p_weekly_plan, 1), 0) > 156 or exists (select 1 from unnest(p_weekly_plan) h where h < 0 or h > 80) then
    raise exception 'The weekly plan is out of range.' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_array_elements(p_weeks) w where (w ->> 'week')::integer not between 1 and 156) then
    raise exception 'A week must be between 1 and 156.' using errcode = 'P0001';
  end if;
  update public.courses set weekly_plan = coalesce(p_weekly_plan, '{}') where id = p_course;
  if not found then
    raise exception 'Not found.' using errcode = 'P0002';
  end if;
  update public.course_topics t set planned_week = (w ->> 'week')::smallint
    from jsonb_array_elements(p_weeks) w
   where t.id = (w ->> 'id')::uuid and t.course_id = p_course;
  get diagnostics changed = row_count;
  return changed;
end $$;

revoke execute on function public.add_course_outline(uuid, jsonb) from public, anon;
revoke execute on function public.plan_course(uuid, jsonb, numeric[]) from public, anon;
grant execute on function public.add_course_outline(uuid, jsonb) to authenticated;
grant execute on function public.plan_course(uuid, jsonb, numeric[]) to authenticated;
