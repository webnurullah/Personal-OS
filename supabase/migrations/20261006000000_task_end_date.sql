-- Tasks can run over several days: an optional end date, on or after the due date.
-- Run this once in Supabase → SQL Editor (after the two earlier files).

alter table public.tasks
  add column end_date date,
  add constraint tasks_end_after_due check (end_date is null or (due_date is not null and end_date >= due_date));
