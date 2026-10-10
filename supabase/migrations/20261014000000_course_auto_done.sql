-- Learning: a course is done by itself when all of its topics are done.
--  * active course, at least one topic, every topic done  -> done
--  * done course, a topic is added or a done topic is set back to not done  -> active again
-- A paused course is never changed by this, and a course marked done by hand stays done when some other topic is ticked.

create or replace function public.course_topic_course_status() returns trigger
language plpgsql set search_path = '' as $$
declare
  cid uuid := coalesce(new.course_id, old.course_id);
  current_status text;
  total integer;
  open_left integer;
begin
  select status into current_status from public.courses where id = cid;
  if current_status is null then
    return null; -- the course itself is being deleted
  end if;
  select count(*), count(*) filter (where status <> 'done') into total, open_left from public.course_topics where course_id = cid;
  if current_status = 'active' and total > 0 and open_left = 0 then
    update public.courses set status = 'done' where id = cid;
  elsif current_status = 'done' and open_left > 0
        and (tg_op = 'INSERT' or (tg_op = 'UPDATE' and old.status = 'done' and new.status <> 'done')) then
    update public.courses set status = 'active' where id = cid;
  end if;
  return null;
end $$;

drop trigger if exists course_topics_course_status on public.course_topics;
create trigger course_topics_course_status
  after insert or update of status or delete on public.course_topics
  for each row execute function public.course_topic_course_status();

-- Courses whose topics are all done already are done.
update public.courses c
   set status = 'done'
 where c.status = 'active'
   and exists (select 1 from public.course_topics t where t.course_id = c.id)
   and not exists (select 1 from public.course_topics t where t.course_id = c.id and t.status <> 'done');
