-- Learning: a topic can be planned for a range of dates you pick (from … to) instead of a single week number.
-- planned_week is kept (the plan the old way, and what "Plan weeks" fills in): when you pick dates, planned_week becomes the week the range
-- STARTS in, so everything that counts weeks keeps working; when a week is set by itself (Plan weeks, an outline), the dates are cleared.
-- "This Week's Plan" lists the topics whose dates touch this week (or, with no dates, whose planned week is this week).
-- Safe to run again.

alter table public.course_topics add column if not exists plan_start date;
alter table public.course_topics add column if not exists plan_end date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'course_topics_plan_dates_check') then
    alter table public.course_topics add constraint course_topics_plan_dates_check
      check ((plan_start is null) = (plan_end is null) and (plan_start is null or (plan_end >= plan_start and plan_end - plan_start <= 730)));
  end if;
end $$;

create or replace function public.course_topic_plan() returns trigger
language plpgsql set search_path = '' as $$
declare
  first_day date;
begin
  -- A week set on its own (Plan weeks, an outline) replaces the dates: they would no longer agree with it.
  if tg_op = 'UPDATE' and new.plan_start is not null and new.plan_start is not distinct from old.plan_start and new.planned_week is distinct from old.planned_week then
    new.plan_start := null;
    new.plan_end := null;
  end if;
  -- Dates picked: the planned week is the week the range starts in.
  if new.plan_start is not null and (tg_op = 'INSERT' or new.plan_start is distinct from old.plan_start) then
    select c.start_date into first_day from public.courses c where c.id = new.course_id;
    if first_day is not null then
      new.planned_week := least(156, greatest(1, (new.plan_start - first_day) / 7 + 1))::smallint;
    end if;
  end if;
  return new;
end $$;

create or replace trigger course_topics_plan_dates
  before insert or update of plan_start, plan_end, planned_week on public.course_topics
  for each row execute function public.course_topic_plan();
